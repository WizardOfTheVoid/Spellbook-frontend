import assert from 'node:assert/strict'
import test from 'node:test'
import type { IpcMain } from 'electron'
import type { HttpClient } from '../api/http-client'
import type { RequestIdFactory } from '../request-id-factory'
import type { OverlayActivityGuard } from '../services/overlay-activity-guard'
import type { CoreCallResult } from '../types'
import { ModerationIpcHandlers } from './moderation-ipc-handlers'

type Handler = (...args: unknown[]) => unknown

type PostCall = {
  path: string
  payload: Record<string, unknown>
}

function createUnbanHandlerFixture(inactiveResult: CoreCallResult | null = null) {
  const handlers = new Map<string, Handler>()
  const postCalls: PostCall[] = []
  let inactiveChecks = 0
  let requestIdCalls = 0

  new ModerationIpcHandlers(
    { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) } as unknown as IpcMain,
    {
      postCoreInput: async (path: string, payload: Record<string, unknown>) => {
        postCalls.push({ path, payload })
        return { ok: true, status: 200, statusText: 'OK', data: { delivered: true } }
      }
    } as unknown as HttpClient,
    {
      next: (scope: string) => {
        requestIdCalls += 1
        return `test-${scope}`
      }
    } as RequestIdFactory,
    {
      getInactiveGameCommandResult: () => {
        inactiveChecks += 1
        return inactiveResult
      }
    } as unknown as OverlayActivityGuard
  ).register()

  const handler = handlers.get('core:unban')
  assert.ok(handler)

  return {
    handler,
    postCalls,
    inactiveChecks: () => inactiveChecks,
    requestIdCalls: () => requestIdCalls
  }
}

test('core unban sends only a structured trimmed player id through Core input', async () => {
  const { handler, postCalls, inactiveChecks, requestIdCalls } = createUnbanHandlerFixture()

  const result = await handler({}, {
    playfabId: ' PLAYER_1 ',
    command: 'UnbanId DIFFERENT_PLAYER'
  })

  assert.deepEqual(postCalls, [{
    path: '/v2/console/unban',
    payload: { id: 'test-unban', playfabId: 'PLAYER_1' }
  }])
  assert.equal(inactiveChecks(), 1)
  assert.equal(requestIdCalls(), 1)
  assert.deepEqual(result, { ok: true, status: 200, statusText: 'OK', data: { delivered: true } })
})

test('core unban cannot call Core while game input ownership is unavailable', async () => {
  const inactiveResult: CoreCallResult = {
    ok: false,
    status: 409,
    statusText: 'OVERLAY_INACTIVE',
    data: null,
    error: { code: 'OVERLAY_INACTIVE', message: 'Bring the overlay to the foreground first.' }
  }
  const { handler, postCalls, inactiveChecks, requestIdCalls } = createUnbanHandlerFixture(inactiveResult)

  const result = await handler({}, { playfabId: 'PLAYER_1' })

  assert.equal(result, inactiveResult)
  assert.equal(inactiveChecks(), 1)
  assert.equal(requestIdCalls(), 0)
  assert.deepEqual(postCalls, [])
})
