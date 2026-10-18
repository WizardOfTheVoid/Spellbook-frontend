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

test('offers every Admin root destination in production', async () => {
  const navigation = await import('./adminNavigation.js').catch(() => ({}))
  const rootTiles = Reflect.get(navigation, 'adminRootTiles') as
    | (() => Array<{ view: string }>)
    | undefined

  assert.deepEqual(rootTiles?.().map(({ view }) => view), [
    'definitions',
    'actions',
    'users',
    'teams',
    'discord',
    'audit-logs',
    'integration-tests',
    'notification-tests',
    `ux-ui`,
    'tick-actions',
    'health'
  ])
})
