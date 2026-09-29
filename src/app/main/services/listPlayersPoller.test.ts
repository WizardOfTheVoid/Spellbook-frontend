import assert from 'node:assert/strict'
import { setImmediate as settle } from 'node:timers/promises'
import { GameStateService } from '../gameState/gameStateService'
import test from 'node:test'
import type { CoreCallResult } from '../types'
import { CurrentGameSnapshotStore, type CurrentGameSnapshotInput } from './currentGameSnapshotStore'
import { ListPlayersService, type ListPlayersRefresh } from './list-players-service'
import { ActionBuilder } from '../core/actionBuilder'
import type { HttpClient } from '../api/http-client'
import type { RequestIdFactory } from '../request-id-factory'
import type { OverlayActivityGuard } from './overlay-activity-guard'
import type { GameCommandDecision } from './gameCommandEligibility'
import { ListPlayersPoller, type ListPlayersScheduler } from './listPlayersPoller'
import { resolvePulseConfig } from './pulseConfig'
import type { SentinelState } from './sentinelService'

const result: CoreCallResult = { ok: true, status: 200, statusText: `OK`, data: null }
const candidate = (): CurrentGameSnapshotInput => ({
  observedAt: `2026-08-31T10:00:00.000Z`,
  gameServerId: 13,
  externalId: `lobby-13`,
  serverName: `Duel`,
  serverAddress: `127.0.0.1:7777`,
  players: [{ index: 0, name: `Player`, playfabId: `PLAYER`, rawLine: `raw` }],
  parseWarnings: []
})

test(`manual author does not leak into subsequent pulses or upgrade an in-flight pulse`, async () => {
  const authors: string[] = []
  const scheduler = new FakeScheduler()
  const poller = createPoller(async (_mode, _signal, _observe, author) => {
    authors.push(author ?? `system`)
    return { result }
  }, new CurrentGameSnapshotStore(), new FakeSentinel(), scheduler)
  poller.start()
  await poller.refreshNow(`user`)
  await poller.refreshNow(`user`)
  scheduler.runOnly()
  await poller.refreshNow()
  assert.deepEqual(authors, [`system`, `user`, `system`])
  await poller.stop()
})

test('start refreshes immediately and schedules the next low-priority pulse after completion', async () => {
  const scheduler = new FakeScheduler()
  const sentinel = new FakeSentinel()
  const modes: string[] = []
  const store = new CurrentGameSnapshotStore()
  const poller = createPoller(async mode => {
    modes.push(mode)
    return { result, candidate: candidate() }
  }, store, sentinel, scheduler)

  poller.start()
  await poller.refreshNow()

  assert.deepEqual(modes, [`interactive`])
  assert.equal(store.get()?.version, 1)
  assert.equal(scheduler.onlyDelay(), 20_000)

  scheduler.runOnly()
  await poller.refreshNow()

  assert.deepEqual(modes, [`interactive`, `interactive`])
  assert.equal(store.get()?.version, 2)
  assert.equal(scheduler.onlyDelay(), 20_000)
})

test(`a stopped game clears old players and rejects refresh before console input`, async () => {
  const store = new CurrentGameSnapshotStore()
  store.replace(candidate())
  let commands = 0
  const game = new GameStateService({ callCore: async () => ({ ok: true, status: 200, statusText: `OK`,
    data: { ok: true, data: { gameRunning: false } } }) }, store)
  const poller = new ListPlayersPoller({ refresh: async () => {
    commands++
    return { result }
  } } as unknown as ListPlayersService,
    store, new FakeSentinel(), resolvePulseConfig({}), new FakeEligibility({ kind: `interactive` }),
    game, new FakeScheduler())
  poller.start()
  const refreshed = await poller.refreshNow()
  assert.equal(refreshed.error?.code, `GAME_NOT_RUNNING`)
  assert.equal(commands, 0)
  assert.equal(store.get(), null)
  await poller.stop()
})

for (const leaveDuringIngest of [false, true]) test(`observed server changes clear before ingestion completes; leave during ingestion: ${leaveDuringIngest}`, async () => {
  const store = new CurrentGameSnapshotStore()
  let running = true
  const game = new GameStateService({ callCore: async () => ({ ok: true, status: 200, statusText: `OK`,
    data: { ok: true, data: { gameRunning: running } } }) }, store)
  await game.refresh()
  const first = candidate()
  game.accept({ observation: first, candidate: first }, store.invalidationVersion)
  const pending = deferred<CoreCallResult>()
  const service = new ListPlayersService({ commands: new ActionBuilder(), executeAction: async () => ({
    ok: true, status: 200, statusText: `OK`, data: { ok: true, data: { serverName: `Another server`,
      serverAddress: `192.0.2.2:7777`, players: [], rawText: `output` } }
  }), postServer: async () => pending.promise } as unknown as HttpClient,
  { next: () => `test` } as unknown as RequestIdFactory, {} as OverlayActivityGuard)
  const poller = new ListPlayersPoller(service, store, new FakeSentinel(), resolvePulseConfig({}),
    new FakeEligibility({ kind: `background` }), game, new FakeScheduler())
  poller.start()
  const refresh = poller.refreshNow()
  await settle()
  assert.equal(store.get(), null)
  assert.equal(game.isInGameServer(), false)
  if (leaveDuringIngest) {
    running = false
    await game.refresh()
  }
  pending.resolve({ ok: true, status: 200, statusText: `OK`, data: { ok: true,
    timestampUtc: new Date().toISOString(), data: { accepted: true, externalId: `new`, gameServerId: 14 } } })
  await refresh
  assert.equal(store.get()?.externalId ?? null, leaveDuringIngest ? null : `new`)
  await poller.stop()
})

test('enabling Sentinel switches hidden polling to Sentinel execution and its faster cadence', async () => {
  const scheduler = new FakeScheduler()
  const sentinel = new FakeSentinel()
  const eligibility = new FakeEligibility({ kind: `background` })
  const modes: string[] = []
  const poller = createPoller(async mode => {
    modes.push(mode)
    return { result }
  }, new CurrentGameSnapshotStore(), sentinel, scheduler, eligibility)

  poller.start()
  await poller.refreshNow()
  assert.equal(scheduler.onlyDelay(), 20_000)

  sentinel.set(true)
  eligibility.decision = { kind: `sentinel` }
  assert.equal(scheduler.onlyDelay(), 5_000)
  scheduler.runOnly()
  await poller.refreshNow()

  assert.deepEqual(modes, [`background`, `sentinel`])
  assert.equal(scheduler.onlyDelay(), 5_000)
  sentinel.set(false)
  assert.equal(scheduler.onlyDelay(), 20_000)
})

test('timer and manual refreshes share one in-flight operation and arm one timeout', async () => {
  const scheduler = new FakeScheduler()
  const pending = deferred<ListPlayersRefresh>()
  let calls = 0
  const store = new CurrentGameSnapshotStore()
  const poller = createPoller(async () => {
    calls += 1
    return pending.promise
  }, store, new FakeSentinel(), scheduler)

  poller.start()
  const first = poller.refreshNow()
  const second = poller.refreshNow()
  await settle()
  assert.equal(calls, 1)

  pending.resolve({ result, candidate: candidate() })
  assert.equal(await first, result)
  assert.equal(await second, result)
  assert.equal(store.get()?.version, 1)
  assert.equal(scheduler.size, 1)
})

test('stop awaits in-flight work and its generation suppresses commit and rearm', async () => {
  const scheduler = new FakeScheduler()
  const pending = deferred<ListPlayersRefresh>()
  const store = new CurrentGameSnapshotStore()
  let signal: AbortSignal | undefined
  const poller = createPoller(async (_mode, cancellation) => {
    signal = cancellation
    return pending.promise
  }, store, new FakeSentinel(), scheduler)

  poller.start()
  await settle()
  const stopping = poller.stop()
  assert.equal(signal?.aborted, true)
  let stopped = false
  void stopping.then(() => { stopped = true })
  await settle()
  assert.equal(stopped, false)

  pending.resolve({ result, candidate: candidate() })
  await stopping

  assert.equal(store.get(), null)
  assert.equal(scheduler.size, 0)
  await assert.rejects(poller.refreshNow(), /not active/u)
})

test('failed attempts preserve the last good snapshot and retry on the next tick', async () => {
  const scheduler = new FakeScheduler()
  const store = new CurrentGameSnapshotStore()
  const first = store.replace(candidate())
  const poller = createPoller(async () => { throw new Error(`offline`) }, store, new FakeSentinel(), scheduler)

  poller.start()
  await assert.rejects(poller.refreshNow(), /offline/u)

  assert.equal(store.get(), first)
  assert.equal(scheduler.onlyDelay(), 20_000)
})

test(`Debug suspension preserves lifecycle and prevents refreshes until resumed`, async () => {
  const scheduler = new FakeScheduler()
  const sentinel = new FakeSentinel()
  let calls = 0
  const poller = createPoller(async () => { calls += 1; return { result } }, new CurrentGameSnapshotStore(), sentinel, scheduler)
  await poller.setDebugPaused(true)
  poller.start()
  await assert.rejects(poller.refreshNow(), /paused/u)
  sentinel.set(true)
  assert.equal(calls, 0)
  assert.equal(scheduler.size, 0)
  await poller.setDebugPaused(false)
  assert.equal(scheduler.onlyDelay(), 5_000)
  scheduler.runOnly()
  await poller.refreshNow()
  assert.equal(calls, 1)
  await poller.setDebugPaused(true)
  await poller.stop()
  await poller.setDebugPaused(false)
  assert.equal(scheduler.size, 0)
})

test(`Debug pause aborts in-flight ListPlayers and prevents its snapshot commit`, async () => {
  const pending = deferred<ListPlayersRefresh>()
  const store = new CurrentGameSnapshotStore()
  const scheduler = new FakeScheduler()
  let signal: AbortSignal | undefined
  const poller = createPoller(async (_mode, cancellation) => { signal = cancellation; return pending.promise }, store, new FakeSentinel(), scheduler)
  poller.start()
  await settle()
  const paused = poller.setDebugPaused(true)
  assert.equal(signal?.aborted, true)
  pending.resolve({ result, candidate: candidate() })
  await paused
  assert.equal(store.get(), null)
  assert.equal(scheduler.size, 0)
})

test(`Resuming Debug waits for an older cancelled refresh before scheduling`, async () => {
  const pending = deferred<ListPlayersRefresh>()
  const scheduler = new FakeScheduler()
  let calls = 0
  const poller = createPoller(async () => { calls += 1; return calls === 1 ? pending.promise : { result } },
    new CurrentGameSnapshotStore(), new FakeSentinel(), scheduler)
  poller.start()
  await settle()
  const pausing = poller.setDebugPaused(true)
  const resuming = poller.setDebugPaused(false)
  assert.equal(scheduler.size, 0)
  pending.resolve({ result })
  await pausing
  await resuming
  assert.equal(scheduler.size, 1)
  scheduler.runOnly()
  await poller.refreshNow()
  assert.equal(calls, 2)
  assert.equal(scheduler.size, 1)
})

function createPoller(
  refresh: ListPlayersService[`refresh`],
  store: CurrentGameSnapshotStore,
  sentinel: FakeSentinel,
  scheduler: FakeScheduler,
  eligibility = new FakeEligibility({ kind: `interactive` })
): ListPlayersPoller {
  return new ListPlayersPoller(
    { refresh: async (...args: Parameters<ListPlayersService[`refresh`]>) => {
      const refreshed = await refresh(...args)
      return { ...refreshed, observation: refreshed.observation ?? (refreshed.candidate ? {
        ...refreshed.candidate, rawText: `output`, rawLines: []
      } : undefined) }
    } } as ListPlayersService,
    store,
    sentinel,
    resolvePulseConfig({ PULSE_LOW_MS: `20000`, PULSE_NORMAL_MS: `11000`, PULSE_HIGH_MS: `7000`, PULSE_SENTINEL_MS: `5000` }),
    eligibility,
    new GameStateService({ callCore: async () => ({ ok: true, status: 200, statusText: `OK`, data: { ok: true, data: { gameRunning: true } } }) }, store),
    scheduler
  )
}

class FakeEligibility {
  constructor(public decision: GameCommandDecision) {}

  async check(): Promise<GameCommandDecision> {
    return this.decision
  }
}

class FakeSentinel {
  private state: SentinelState = { enabled: false }
  private readonly listeners = new Set<(state: SentinelState) => void>()

  getState(): SentinelState {
    return this.state
  }

  subscribe(listener: (state: SentinelState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  set(enabled: boolean): void {
    this.state = { enabled }
    for (const listener of this.listeners) listener(this.state)
  }
}

class FakeScheduler implements ListPlayersScheduler {
  private nextId = 1
  private readonly timers = new Map<number, { callback: () => void, delayMs: number }>()

  get size(): number {
    return this.timers.size
  }

  setTimeout(callback: () => void, delayMs: number): number {
    const id = this.nextId++
    this.timers.set(id, { callback, delayMs })
    return id
  }

  clearTimeout(timer: unknown): void {
    this.timers.delete(Number(timer))
  }

  onlyDelay(): number {
    assert.equal(this.timers.size, 1)
    return [...this.timers.values()][0]!.delayMs
  }

  runOnly(): void {
    assert.equal(this.timers.size, 1)
    const [id, timer] = [...this.timers.entries()][0]!
    this.timers.delete(id)
    timer.callback()
  }
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(accept => { resolve = accept })
  return { promise, resolve }
}
