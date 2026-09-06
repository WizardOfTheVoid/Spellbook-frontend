import assert from 'node:assert/strict'
import test from 'node:test'
import type { IpcMain } from 'electron'
import type { HttpClient } from '../api/http-client'
import type { AppHealthService } from '../health/app-health-service'
import type { RequestIdFactory } from '../request-id-factory'
import type { CurrentGameSnapshotStore } from '../services/currentGameSnapshotStore'
import type { ListPlayersPoller } from '../services/listPlayersPoller'
import type { OverlayActivityGuard } from '../services/overlay-activity-guard'
import type { OverlayWindowController } from '../window/overlay-window-controller'
import type { CoreCallResult } from '../types'
import { CoreIpcHandlers } from './core-ipc-handlers'

type Handler = (...args: unknown[]) => unknown

type PostCall = {
  path: string
  payload: Record<string, unknown>
}

type CoreMessageHandlerFixture = {
  handler: Handler
  postCalls: PostCall[]
  inactiveChecks: () => number
}

test('core metadata reads the non-health Core endpoint', async () => {
  const handlers = new Map<string, Handler>()
  const calls: Array<[string, unknown]> = []
  const expected = { ok: true, status: 200, statusText: 'OK', data: { gameRunning: true } }

  new CoreIpcHandlers(
    { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) } as unknown as IpcMain,
    {
      callCore: async (path: string, init: unknown) => {
        calls.push([path, init])
        return expected
      }
    } as unknown as HttpClient,
    {} as AppHealthService,
    {} as ListPlayersPoller,
    { subscribe: () => () => undefined } as unknown as CurrentGameSnapshotStore,
    {} as RequestIdFactory,
    {} as OverlayActivityGuard,
    {} as OverlayWindowController
  ).register()

  assert.deepEqual(await handlers.get('core:meta')?.(), expected)
  assert.deepEqual(calls, [['/v2/meta/get', { method: 'GET' }]])
})

function createCoreMessageHandlerFixture(inactiveResult: CoreCallResult | null = null): CoreMessageHandlerFixture {
  const handlers = new Map<string, Handler>()
  const postCalls: PostCall[] = []
  let inactiveChecks = 0

  new CoreIpcHandlers(
    { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) } as unknown as IpcMain,
    {
      postCoreInput: async (path: string, payload: Record<string, unknown>) => {
        postCalls.push({ path, payload })
        return { ok: true, status: 200, statusText: 'OK', data: { delivered: true } }
      }
    } as unknown as HttpClient,
    {} as AppHealthService,
    {} as ListPlayersPoller,
    { subscribe: () => () => undefined } as unknown as CurrentGameSnapshotStore,
    { next: (scope: string) => `test-${scope}` } as RequestIdFactory,
    {
      getInactiveGameCommandResult: () => {
        inactiveChecks += 1
        return inactiveResult
      }
    } as unknown as OverlayActivityGuard,
    {} as OverlayWindowController
  ).register()

  const handler = handlers.get('core:message')
  assert.ok(handler)

  return { handler, postCalls, inactiveChecks: () => inactiveChecks }
}

test('core message forwards an admin payload through Core input', async () => {
  const { handler, postCalls, inactiveChecks } = createCoreMessageHandlerFixture()

  const result = await handler({}, { kind: 'admin', message: 'Hello' })

  assert.deepEqual(postCalls, [{
    path: '/v2/console/message',
    payload: { id: 'test-message', kind: 'admin', message: 'Hello' }
  }])
  assert.equal(inactiveChecks(), 1)
  assert.deepEqual(result, { ok: true, status: 200, statusText: 'OK', data: { delivered: true } })
})

test('core message accepts server payloads', async () => {
  const { handler, postCalls } = createCoreMessageHandlerFixture()

  await handler({}, { kind: 'server', message: 'Round starts now' })

  assert.deepEqual(postCalls, [{
    path: '/v2/console/message',
    payload: { id: 'test-message', kind: 'server', message: 'Round starts now' }
  }])
})

test('core message rejects an invalid kind before checking activity', async () => {
  const { handler, postCalls, inactiveChecks } = createCoreMessageHandlerFixture()

  const result = await handler({}, { kind: 'warn', message: 'Hello' })

  assert.deepEqual(result, {
    ok: false,
    status: 400,
    statusText: 'INVALID_REQUEST',
    data: null,
    error: { code: 'INVALID_REQUEST', message: 'Message kind must be admin or server.' }
  })
  assert.equal(inactiveChecks(), 0)
  assert.deepEqual(postCalls, [])
})

test('core message rejects a blank message before checking activity', async () => {
  const { handler, postCalls, inactiveChecks } = createCoreMessageHandlerFixture()

  const result = await handler({}, { kind: 'admin', message: '   ' })

  assert.deepEqual(result, {
    ok: false,
    status: 400,
    statusText: 'INVALID_REQUEST',
    data: null,
    error: { code: 'INVALID_REQUEST', message: 'Message is required.' }
  })
  assert.equal(inactiveChecks(), 0)
  assert.deepEqual(postCalls, [])
})

test('core message does not call Core while the overlay is inactive', async () => {
  const inactiveResult: CoreCallResult = {
    ok: false,
    status: 409,
    statusText: 'OVERLAY_INACTIVE',
    data: null,
    error: { code: 'OVERLAY_INACTIVE', message: 'Bring the overlay to the foreground first.' }
  }
  const { handler, postCalls, inactiveChecks } = createCoreMessageHandlerFixture(inactiveResult)

  const result = await handler({}, { kind: 'admin', message: 'Hello' })

  assert.equal(result, inactiveResult)
  assert.equal(inactiveChecks(), 1)
  assert.deepEqual(postCalls, [])
})

test('native ListPlayers calls the isolated Core endpoint without a restore target', async () => {
  const handlers = new Map<string, Handler>()
  const calls: Array<{ path: string; init?: RequestInit }> = []
  const expected: CoreCallResult = {
    ok: false,
    status: 501,
    statusText: 'Not Implemented',
    data: {
      ok: false,
      requestId: 'test-native-listplayers',
      error: {
        code: 'NATIVE_LISTPLAYERS_NOT_IMPLEMENTED',
        message: 'Native ListPlayers is not implemented.'
      }
    }
  }

  new CoreIpcHandlers(
    { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) } as unknown as IpcMain,
    {
      callCore: async (path: string, init?: RequestInit) => {
        calls.push({ path, init })
        return expected
      }
    } as unknown as HttpClient,
    {} as AppHealthService,
    {} as ListPlayersPoller,
    { subscribe: () => () => undefined } as unknown as CurrentGameSnapshotStore,
    { next: (scope: string) => `test-${scope}` } as RequestIdFactory,
    {} as OverlayActivityGuard,
    {} as OverlayWindowController
  ).register()

  const handler = handlers.get('core:nativeListPlayers')
  assert.ok(handler)

  const result = await handler()

  assert.equal(result, expected)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].path, '/v2/native/listplayers')
  assert.equal(calls[0].init?.method, 'POST')
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    id: 'test-native-listplayers'
  })
})

test(`snapshot IPC reads state and delegates both manual refresh channels to the Main poller`, async () => {
  const handlers = new Map<string, Handler>()
  const expectedSnapshot = { version: 4, players: [] }
  const expectedResult = { ok: true, status: 200, statusText: `OK`, data: null }
  let refreshCalls = 0

  new CoreIpcHandlers(
    { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) } as unknown as IpcMain,
    {} as HttpClient,
    {} as AppHealthService,
    { refreshNow: async () => { refreshCalls += 1; return expectedResult } } as unknown as ListPlayersPoller,
    {
      get: () => expectedSnapshot,
      subscribe: () => () => undefined
    } as unknown as CurrentGameSnapshotStore,
    {} as RequestIdFactory,
    {} as OverlayActivityGuard,
    {} as OverlayWindowController
  ).register()

  assert.equal(handlers.get(`core:currentGameSnapshot`)?.(), expectedSnapshot)
  assert.equal(await handlers.get(`core:refreshCurrentGameSnapshot`)?.(), expectedResult)
  assert.equal(await handlers.get(`core:listPlayers`)?.(), expectedResult)
  assert.equal(refreshCalls, 2)
})

test(`snapshot changes publish only through the existing overlay boundary`, () => {
  const handlers = new Map<string, Handler>()
  const sent: unknown[][] = []
  let listener: ((snapshot: unknown) => void) | null = null

  new CoreIpcHandlers(
    { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) } as unknown as IpcMain,
    {} as HttpClient,
    {} as AppHealthService,
    {} as ListPlayersPoller,
    { subscribe: (next: (snapshot: unknown) => void) => { listener = next; return () => undefined } } as unknown as CurrentGameSnapshotStore,
    {} as RequestIdFactory,
    {} as OverlayActivityGuard,
    { sendToCurrent: (...args: unknown[]) => { sent.push(args); return false } } as unknown as OverlayWindowController
  ).register()

  const publish = listener as ((snapshot: unknown) => void) | null
  assert.ok(publish)
  publish({ version: 5, players: [] })
  publish(null)
  assert.deepEqual(sent, [
    [`core:currentGameSnapshotChanged`, { version: 5, players: [] }],
    [`core:currentGameSnapshotChanged`, null]
  ])
})
