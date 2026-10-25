import assert from 'node:assert/strict'
import test from 'node:test'
import { setImmediate as settle } from 'node:timers/promises'
import { SnapshotLookupService } from './snapshot-lookup-service'
import { CurrentGameSnapshotStore } from './currentGameSnapshotStore'
import type { CoreCallResult } from '../types'

const ok = (data: unknown): CoreCallResult => ({ ok: true, status: 200, statusText: `OK`, data: { ok: true, data } })

function fixture(age = 0) {
  const snapshots = new CurrentGameSnapshotStore()
  snapshots.replace({ observedAt: new Date(Date.now() - 120_000).toISOString(), gameServerId: 13, externalId: `server`,
    serverName: `Server`, serverAddress: null, players: [{ index: 0, name: `Wrong raw name`, playfabId: `RAW`, rawLine: `` }], parseWarnings: [] })
  let fresh = age < 60_000
  const events: any[] = []
  const steps: string[] = []
  const loading: boolean[] = []
  const result = { player: { playfabId: `P1`, name: `Server name` }, proposedPlayer: { playfabId: `P1`, name: `Server name` },
    costUsd: 0.00042, inferenceMs: 120, inputTokens: 999, confidence: 0.97, margin: 0.90, reason: `matched` }
  const http = {
    authenticatedEpoch: 1 as number | null,
    callCore: async (_path?: string, _request?: RequestInit): Promise<CoreCallResult> => {
      steps.push(`capture`)
      return ok({ imageBase64: `png` })
    },
    getServer: async (_path?: string, _query?: unknown, _signal?: AbortSignal): Promise<CoreCallResult> => {
      steps.push(`readServer`)
      return ok({ roster: { gameServerId: 13,
        sources: { listplayers: { fresh } }, players: [{ name: `Server name`, playfabId: `P1` }] } })
    },
    postServer: async (path: string, input: unknown, _signal?: AbortSignal): Promise<CoreCallResult> => {
      steps.push(`model`)
      assert.equal(path, `/playerDetection`)
      assert.deepEqual(input, { imageBase64: `png`, gameServerId: 13, clientId: `client` })
      return ok(result)
    }
  }
  const roster = { clientId: `client`, refresh: async (_signal?: AbortSignal): Promise<CoreCallResult> => {
    steps.push(`refresh`)
    fresh = true
    return ok(null)
  },
    setLoading: (value: boolean) => loading.push(value) }
  const client = new SnapshotLookupService(http, { sendToCurrent: (_channel: string, event: unknown) => {
    events.push(event)
    return true
  } } as never,
    { next: () => `test` }, snapshots, () => true, roster)
  return { client, http, roster, snapshots, events, steps, loading, result }
}

test(`fresh server data skips refresh despite an old and different local roster`, async () => {
  const f = fixture(59_000)
  await f.client.run()
  assert.ok(!f.steps.includes(`refresh`))
  assert.equal(f.events[0].phase, `started`)
  assert.equal(f.events[1].phase, `finished`)
  assert.equal(f.events[1].ok, true)
  assert.deepEqual(f.events[1].match, { playfabId: `P1`, gameServerId: 13 })
  assert.equal(f.events[1].diagnostics.costUsd, 0.00042)
  assert.deepEqual(f.loading, [true, false])
})

test(`60-second stale data refreshes concurrently with capture and detection waits for both`, async () => {
  const f = fixture(60_000)
  const capture = Promise.withResolvers<CoreCallResult>()
  const refresh = Promise.withResolvers<CoreCallResult>()
  f.http.callCore = async () => {
    f.steps.push(`capture`)
    return capture.promise
  }
  const update = f.roster.refresh
  f.roster.refresh = async () => {
    f.steps.push(`refreshStarted`)
    await refresh.promise
    return update()
  }
  const running = f.client.run()
  try {
    await settle()
    assert.ok(f.steps.includes(`capture`))
    assert.ok(f.steps.includes(`refreshStarted`))
    assert.ok(!f.steps.includes(`model`))
    capture.resolve(ok({ imageBase64: `png` }))
    await settle()
    assert.ok(!f.steps.includes(`model`))
  } finally {
    capture.resolve(ok({ imageBase64: `png` }))
    refresh.resolve(ok(null))
    await running
  }
  assert.equal(f.events.at(-1).ok, true)
})

test(`missing local state still starts capture and refresh establishes server identity`, async () => {
  const f = fixture()
  const previous = f.snapshots.get()!
  f.snapshots.clear()
  const refresh = f.roster.refresh
  f.roster.refresh = async () => {
    f.snapshots.replace({ ...previous, players: [...previous.players], parseWarnings: [] })
    return refresh()
  }
  await f.client.run()
  assert.ok(f.steps.includes(`capture`))
  assert.ok(f.steps.includes(`refresh`))
  assert.equal(f.events.at(-1).ok, true)
})

test(`failed capture or refresh ends feedback without a model request`, async () => {
  for (const kind of [`capture`, `refresh`]) {
    const f = fixture(60_000)
    const failure = async (): Promise<CoreCallResult> => ({ ok: false, status: 408, statusText: `ACTION_EXPIRED`, data: null })
    if (kind === `capture`) f.http.callCore = failure
    else f.roster.refresh = failure
    await f.client.run()
    assert.ok(!f.steps.includes(`model`))
    assert.equal(f.events.at(-1).ok, false)
    assert.equal(f.loading.at(-1), false)
    assert.equal(f.events.at(-1).diagnostics.costUsd, null)
  }
})

test(`server or account changes reject late results and preserve reported charges`, async () => {
  for (const kind of [`server`, `account`]) {
    const f = fixture()
    const post = f.http.postServer
    f.http.postServer = async (path, input) => {
      const response = await post(path, input)
      if (kind === `server`) f.snapshots.clear()
      else f.http.authenticatedEpoch = null
      return response
    }
    await f.client.run()
    assert.equal(f.events.at(-1).ok, false)
    assert.equal(f.events.at(-1).diagnostics.costUsd, 0.00042)
    assert.equal(f.events.at(-1).diagnostics.outcome, `stale`)
  }
})

test(`repeated F4 shares one run and server changes during preparation prevent inference`, async () => {
  const f = fixture(60_000)
  f.roster.refresh = async () => {
    await settle()
    f.snapshots.clear()
    return ok(null)
  }
  const running = f.client.run()
  await f.client.run()
  await running
  assert.equal(f.events.filter(event => event.phase === `started`).length, 1)
  assert.equal(f.events.filter(event => event.phase === `finished`).length, 1)
  assert.equal(f.events.at(-1).ok, false)
  assert.ok(!f.steps.includes(`model`))
})

test(`F4 accepts at most one attempt every two seconds, including failed attempts`, async context => {
  context.mock.timers.enable({ apis: [`Date`], now: 0 })
  for (const failed of [false, true]) {
    const f = fixture()
    const capture = f.http.callCore
    if (failed) f.http.callCore = async () => { throw new Error(`Capture failed`) }
    await f.client.run()
    f.http.callCore = capture
    await f.client.run()
    context.mock.timers.tick(1999)
    await f.client.run()
    assert.equal(f.events.filter(event => event.phase === `started`).length, 1)
    context.mock.timers.tick(1)
    await f.client.run()
    assert.equal(f.events.filter(event => event.phase === `started`).length, 2)
  }
})

test(`the six-second deadline covers capture, roster preparation and inference without late feedback`, async context => {
  context.mock.timers.enable({ apis: [`Date`, `setTimeout`], now: 0 })
  for (const stage of [`capture`, `roster`, `provider`]) {
    const f = fixture(stage === `roster` ? 60_000 : 0)
    const pending = Promise.withResolvers<CoreCallResult>()
    let cancellation: AbortSignal | undefined
    if (stage === `capture`) f.http.callCore = async (_path, request) => {
      cancellation = request?.signal ?? undefined
      return pending.promise
    }
    else if (stage === `roster`) f.roster.refresh = async signal => {
      cancellation = signal
      return pending.promise
    }
    else f.http.postServer = async (_path, _input, signal) => {
      cancellation = signal
      return pending.promise
    }
    const running = f.client.run()
    try {
      await settle()
      context.mock.timers.tick(5999)
      await settle()
      assert.equal(f.events.filter(event => event.phase === `finished`).length, 0, stage)
      context.mock.timers.tick(1)
      await settle()
      assert.equal(f.events.at(-1).phase, `finished`, stage)
      assert.equal(f.events.at(-1).ok, false, stage)
      assert.equal(f.events.at(-1).diagnostics.outcome, `timedOut`, stage)
      assert.equal(f.events.at(-1).diagnostics.costUsd, null, stage)
      assert.equal(cancellation?.aborted, true, stage)
      assert.equal(f.loading.at(-1), false, stage)
      pending.resolve(stage === `capture` ? ok({ imageBase64: `late` }) : ok(f.result))
      await running
      await settle()
      assert.equal(f.loading.at(-1), false, stage)
      assert.equal(f.events.filter(event => event.phase === `finished`).length, 1, stage)
      assert.ok(!f.events.some(event => event.ok === true), stage)
    } finally {
      pending.resolve(ok({ imageBase64: `late` }))
      await running
    }
  }
})
