import assert from 'node:assert/strict'
import test from 'node:test'
import type { HttpClient } from '../api/http-client'
import { ActionBuilder } from '../core/actionBuilder'
import type { CoreCommand, CoreActionOptions } from '../../shared/coreAction'
import type { RequestIdFactory } from '../request-id-factory'
import type { CoreCallResult } from '../types'
import type { OverlayActivityGuard } from './overlay-activity-guard'
import { ListPlayersService } from './list-players-service'
import { ConsoleSetupService } from '../consoleSetup/consoleSetupService'

const ok = (data: unknown): CoreCallResult => ({ ok: true, status: 200, statusText: `OK`, data })

const coreSnapshot = () => ok({
  ok: true,
  data: {
    serverName: null,
    serverAddress: `127.0.0.1:7777`,
    rawText: `snapshot`,
    rawLines: [],
    parseWarnings: [`warning`],
    players: [{
      index: 0,
      name: `  Exact Player  `,
      playfabId: `PLAYER`,
      rawLine: `raw`
    }]
  }
})

test(`ListPlayers forwards runtime cancellation to the Action request`, async () => {
  const cancellation = new AbortController()
  const service = createService({
    executeAction: async (_commands, options) => {
      assert.equal(options.signal, cancellation.signal)
      return ok(null)
    }
  }, null)
  await service.refresh(`background`, cancellation.signal)
})

test('interactive refresh retains the foreground guard and typed restore-target path', async () => {
  const calls: Array<{ commands: CoreCommand[], options: CoreActionOptions }> = []
  const service = createService({
    executeAction: async (commands: CoreCommand[], options: CoreActionOptions) => {
      calls.push({ commands, options })
      return coreSnapshot()
    },
    postServer: async () => ok({
      ok: true,
      timestampUtc: `2026-09-01T00:00:00.000Z`,
      data: { accepted: true, externalId: `lobby-13`, gameServerId: 13 }
    })
  }, null)

  const refreshed = await service.refresh(`interactive`)

  assert.deepEqual(calls, [{
    commands: [{ type: `console`, command: `ListPlayers`, consoleKey: `NumpadSubtract`, expectClipboard: true, restoreClipboard: true }],
    options: { id: `test-listplayers`, author: `user`, priority: `low` }
  }])
  assert.deepEqual(refreshed.candidate, {
    observedAt: `2026-09-01T00:00:00.000Z`,
    gameServerId: 13,
    externalId: `lobby-13`,
    serverName: null,
    serverAddress: `127.0.0.1:7777`,
    players: [{
      index: 0,
      name: `  Exact Player  `,
      playfabId: `PLAYER`,
      rawLine: `raw`,
      eosPlayerId: null,
      score: null,
      kills: null,
      deaths: null,
      pingMs: null
    }],
    parseWarnings: [`warning`]
  })
})

test('interactive refresh returns the guard result before Core input', async () => {
  const inactive: CoreCallResult = {
    ok: false,
    status: 409,
    statusText: `OVERLAY_INACTIVE`,
    data: null,
    error: { code: `OVERLAY_INACTIVE`, message: `inactive` }
  }
  let coreCalls = 0
  const service = createService({
    executeAction: async () => {
      coreCalls += 1
      return coreSnapshot()
    }
  }, inactive)

  assert.deepEqual(await service.refresh(`interactive`), { result: inactive })
  assert.equal(coreCalls, 0)
})

for (const mode of [`background`, `sentinel`] as const) test(`${mode} refresh submits a system Action with the correct priority`, async () => {
  const calls: CoreActionOptions[] = []
  let guardChecks = 0
  const service = createService({
    executeAction: async (commands, options) => {
      assert.equal(commands[0]?.type, `console`)
      calls.push(options)
      return coreSnapshot()
    },
    postServer: async () => ok({ ok: true })
  }, null, () => { guardChecks += 1 })
  await service.refresh(mode)
  assert.equal(guardChecks, 0)
  assert.deepEqual(calls, [{ id: `test-listplayers`, author: `system`, priority: mode === `sentinel` ? `high` : `low` }])
})

test('only an accepted Server ingest with stable IDs creates a snapshot candidate', async () => {
  const responses = [
    ok({ ok: true, data: { accepted: false, reason: `MAIN_MENU_SNAPSHOT` } }),
    ok({ ok: true, data: { accepted: `true`, externalId: `lobby-13`, gameServerId: 13 } }),
    ok({ ok: true, data: { accepted: true, externalId: `lobby-13` } }),
    ok({ ok: true, data: { accepted: true, gameServerId: 13, externalId: ` ` } })
  ]
  const service = createService({
    executeAction: async () => coreSnapshot(),
    postServer: async () => responses.shift()!
  }, null)

  for (let index = 0; index < 4; index += 1) {
    assert.equal((await service.refresh(`interactive`)).candidate, undefined)
  }
})

test('Core parse and Server ingest failures return no candidate', async () => {
  let serverCalls = 0
  const malformed = createService({
    executeAction: async () => ok({ ok: true, data: { players: `invalid` } }),
    postServer: async () => {
      serverCalls += 1
      return ok(null)
    }
  }, null)
  assert.equal((await malformed.refresh(`interactive`)).candidate, undefined)
  assert.equal(serverCalls, 0)

  const ingestFailure: CoreCallResult = {
    ok: false,
    status: 503,
    statusText: `SERVER_UNAVAILABLE`,
    data: null,
    error: { code: `SERVER_UNAVAILABLE`, message: `offline` }
  }
  const failed = createService({
    executeAction: async () => coreSnapshot(),
    postServer: async () => ingestFailure
  }, null)

  const refreshed = await failed.refresh(`interactive`)
  assert.equal(refreshed.result, ingestFailure)
  assert.deepEqual(refreshed.consoleOutput?.result, coreSnapshot())
})

test(`ListPlayers validates the submitted console key before a failed backend ingest`, async () => {
  const failure = { ok: false, status: 503, statusText: `SERVER_UNAVAILABLE`, data: null }
  const setup = new ConsoleSetupService({ callCore: async () => ok(null) }, () => `Backquote`, async () => ({ result: failure }))
  const service = new ListPlayersService(
    {
      commands: new ActionBuilder(() => `Backquote`),
      executeAction: async () => ok({ ok: true, data: { status: `completed`, sent: true, sentCommands: 1, players: [], rawText: `fresh output` } }),
      postServer: async () => failure
    } as unknown as HttpClient,
    { next: () => `check` } as unknown as RequestIdFactory,
    {} as OverlayActivityGuard,
    (result, key) => setup.observeListPlayers(result, key)
  )
  assert.equal((await service.refresh(`background`)).result.ok, false)
  assert.equal(setup.getState().binding.status, `passed`)
})

function createService(
  httpClient: Partial<HttpClient>,
  inactiveResult: CoreCallResult | null,
  onGuard = () => undefined
): ListPlayersService {
  return new ListPlayersService(
    { commands: new ActionBuilder(), ...httpClient } as HttpClient,
    { next: () => `test-listplayers` } as unknown as RequestIdFactory,
    {
      getInactiveGameCommandResult: () => {
        onGuard()
        return inactiveResult
      }
    } as OverlayActivityGuard
  )
}
