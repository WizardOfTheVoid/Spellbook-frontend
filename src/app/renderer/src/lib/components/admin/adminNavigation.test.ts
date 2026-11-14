import assert from 'node:assert/strict'
import test from 'node:test'
import type { TickAction } from '$lib/core'
import { createNavigationHistory } from '../../navigation/navigationHistory'
import type { AdminView, AdminUserTab } from './adminNavigation'

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
    'health',
    `maintenance`
  ])
})

test(`restoring retired Telemetry navigation returns to Admin without changing active destinations`, async () => {
  const navigation = await import('./adminNavigation.js')
  const restore = Reflect.get(navigation, `restoreAdminView`) as (view: string) => string
  assert.equal(restore(`telemetry`), `root`)
  assert.equal(restore(`tick-actions`), `tick-actions`)
  assert.equal(restore(`user`), `user`)
})

test(`profile tab changes preserve the selected tab without delaying Back to users`, async () => {
  const module = await import('./adminNavigation')
  const route = Reflect.get(module, `adminRoute`)
  assert.equal(typeof route, `function`)
  let state: { view: AdminView, selectedUser: { id: number } | null, selectedUserTab: AdminUserTab } = { view: `users`, selectedUser: null, selectedUserTab: `details` }
  const history = createNavigationHistory()
  history.register(`admin`, () => state, value => { state = value }, route)
  await history.visit(() => { state = { view: `user`, selectedUser: { id: 201 }, selectedUserTab: `details` } })
  await history.visit(() => { state.selectedUserTab = `activity` })
  await history.visit(() => { state.selectedUserTab = `permissions` })
  await history.back()
  assert.equal(state.view, `users`)
  await history.forward()
  assert.equal(state.view, `user`)
  assert.equal(state.selectedUserTab, `permissions`)
})
