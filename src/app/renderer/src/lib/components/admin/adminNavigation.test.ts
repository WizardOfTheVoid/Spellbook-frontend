import assert from 'node:assert/strict'
import test from 'node:test'
import type { TickAction } from '$lib/core'

type BackState = {
  view: string
  selectedAction: TickAction | null
}

test('backs out through the tick action list before admin', async () => {
  const navigation = await import('./adminNavigation.js').catch(() => ({}))
  const back = (navigation as { adminBack?: (state: BackState) => BackState }).adminBack

  assert.ok(back)
  assert.deepEqual(back({ view: 'tick-actions', selectedAction: 'servers' }), {
    view: 'tick-actions',
    selectedAction: null
  })
  assert.deepEqual(back({ view: 'tick-actions', selectedAction: null }), {
    view: 'root',
    selectedAction: null
  })
})

test('offers Health inside Admin and keeps development destinations conditional', async () => {
  const navigation = await import('./adminNavigation.js').catch(() => ({}))
  const rootTiles = Reflect.get(navigation, 'adminRootTiles') as
    | ((development: boolean) => Array<{ view: string }>)
    | undefined

  assert.deepEqual(rootTiles?.(false).map(({ view }) => view), [
    'users',
    'teams',
    'audit-logs',
    'integration-tests',
    'notification-tests',
    'tick-actions',
    'health'
  ])
  assert.deepEqual(rootTiles?.(true).slice(-2).map(({ view }) => view), [
    'dev-grid',
    'dev-ui'
  ])
})
