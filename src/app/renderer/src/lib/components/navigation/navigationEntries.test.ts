import assert from 'node:assert/strict'
import test from 'node:test'

type NavEntry = {
  page: string
  label: string
  icon: string
  badge?: number
}

test('adds Notifications to the main navigation and removes Health', async () => {
  const createNavigationEntries = await loadCreateNavigationEntries()
  const entries = createNavigationEntries(false, 0)

  assert.deepEqual(entries.map(({ page }) => page), [
    'dashboard',
    'server',
    'wanted',
    'players',
    'servers',
    'profiles',
    `teams`,
    'notifications'
  ])
  assert.deepEqual(entries.find(({ page }) => page === 'notifications'), {
    page: 'notifications',
    label: 'Notifications',
    icon: 'fa-bell'
  })
})

test('uses the gamepad icon only for the current game server', async () => {
  const createNavigationEntries = await loadCreateNavigationEntries()
  const entries = createNavigationEntries(false, 0)

  assert.equal(entries.find(({ page }) => page === 'server')?.icon, 'fa-gamepad')
  assert.equal(entries.find(({ page }) => page === 'servers')?.icon, 'fa-server')
})

test('shows a positive notification count and hides a zero count', async () => {
  const createNavigationEntries = await loadCreateNavigationEntries()

  assert.equal(
    createNavigationEntries(false, 0).find(({ page }) => page === 'notifications')?.badge,
    undefined
  )
  assert.equal(
    createNavigationEntries(true, 7).find(({ page }) => page === 'notifications')?.badge,
    7
  )
  assert.equal(createNavigationEntries(true, 7).at(-1)?.page, 'admin')
})

test(`keeps team join-request counts independent from general notifications`, async () => {
  const createNavigationEntries = await loadCreateNavigationEntries()
  for (const isSuperadmin of [false, true]) {
    const entries = createNavigationEntries(isSuperadmin, 7, 3)
    assert.equal(entries.find(entry => entry.page === `teams`)?.badge, 3)
    assert.equal(entries.find(entry => entry.page === `notifications`)?.badge, 7)
    assert.equal(createNavigationEntries(isSuperadmin, 7, 0).find(entry => entry.page === `teams`)?.badge, undefined)
  }
})

async function loadCreateNavigationEntries(): Promise<(
  isSuperadmin: boolean,
  notificationCount: number,
  pendingRequestCount?: number,
) => NavEntry[]> {
  const modulePath = './navigationEntries'
  const module = await import(modulePath).catch(() => ({}))
  const createNavigationEntries = Reflect.get(module, 'createNavigationEntries')

  assert.equal(typeof createNavigationEntries, 'function')
  return createNavigationEntries as (
    isSuperadmin: boolean,
    notificationCount: number,
    pendingRequestCount?: number,
  ) => NavEntry[]
}

test(`Analysis is no longer a navigation destination for either role`, async () => {
  const entries = await loadCreateNavigationEntries()
  for (const isSuperadmin of [false, true]) {
    assert.equal(entries(isSuperadmin, 0).some(entry => String(entry.page) === `analysis`), false)
  }
})
