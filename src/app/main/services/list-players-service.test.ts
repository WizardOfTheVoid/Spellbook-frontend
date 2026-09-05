import assert from 'node:assert/strict'
import test from 'node:test'
import type { HttpClient } from '../api/http-client'
import type { RequestIdFactory } from '../request-id-factory'
import type { CoreCallResult } from '../types'
import type { OverlayActivityGuard } from './overlay-activity-guard'
import { ListPlayersService } from './list-players-service'

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

test('interactive refresh retains the foreground guard and typed restore-target path', async () => {
  const calls: Array<{ path: string, payload: Record<string, unknown> }> = []
  const service = createService({
    postCoreInput: async (path: string, payload: Record<string, unknown>) => {
      calls.push({ path, payload })
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
    path: `/v2/console/listplayers`,
    payload: { id: `test-listplayers`, timeoutMs: 5000 }
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
    postCoreInput: async () => {
      coreCalls += 1
      return coreSnapshot()
    }
  }, inactive)

  assert.deepEqual(await service.refresh(`interactive`), { result: inactive })
  assert.equal(coreCalls, 0)
})

test('hidden refresh bypasses overlay helpers and requires Core idle validation', async () => {
  const calls: Array<{ path: string, init?: RequestInit }> = []
  let guardChecks = 0
  let postCoreInputCalls = 0
  const service = createService({
    callCore: async (path: string, init?: RequestInit) => {
      calls.push({ path, init })
      return coreSnapshot()
    },
    postCoreInput: async () => {
      postCoreInputCalls += 1
      return coreSnapshot()
    },
    postServer: async () => ok({
      ok: true,
      timestampUtc: `2026-09-01T00:00:00.000Z`,
      data: { accepted: true, externalId: `lobby-13`, gameServerId: 13 }
    })
  }, null, () => { guardChecks += 1 })

  await service.refresh(`background`)

  assert.equal(guardChecks, 0)
  assert.equal(postCoreInputCalls, 0)
  assert.equal(calls[0]?.path, `/v2/console/listplayers`)
  assert.equal(calls[0]?.init?.method, `POST`)
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    id: `test-listplayers`,
    timeoutMs: 5000,
    background: true,
    requireIdle: true
  })
})

test('only an accepted Server ingest with stable IDs creates a snapshot candidate', async () => {
  const responses = [
    ok({ ok: true, data: { accepted: false, reason: `MAIN_MENU_SNAPSHOT` } }),
    ok({ ok: true, data: { accepted: `true`, externalId: `lobby-13`, gameServerId: 13 } }),
    ok({ ok: true, data: { accepted: true, externalId: `lobby-13` } }),
    ok({ ok: true, data: { accepted: true, gameServerId: 13, externalId: ` ` } })
  ]
  const service = createService({
    postCoreInput: async () => coreSnapshot(),
    postServer: async () => responses.shift()!
  }, null)

  for (let index = 0; index < 4; index += 1) {
    assert.equal((await service.refresh(`interactive`)).candidate, undefined)
  }
})

test('Core parse and Server ingest failures return no candidate', async () => {
  let serverCalls = 0
  const malformed = createService({
    postCoreInput: async () => ok({ ok: true, data: { players: `invalid` } }),
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
    postCoreInput: async () => coreSnapshot(),
    postServer: async () => ingestFailure
  }, null)

  assert.deepEqual(await failed.refresh(`interactive`), { result: ingestFailure })
})

function createService(
  httpClient: Partial<HttpClient>,
  inactiveResult: CoreCallResult | null,
  onGuard = () => undefined
): ListPlayersService {
  return new ListPlayersService(
    httpClient as HttpClient,
    { next: () => `test-listplayers` } as unknown as RequestIdFactory,
    {
      getInactiveGameCommandResult: () => {
        onGuard()
        return inactiveResult
      }
    } as OverlayActivityGuard
  )
}
