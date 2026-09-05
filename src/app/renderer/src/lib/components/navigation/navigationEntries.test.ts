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
    'players',
    'wanted',
    'servers',
    'profiles',
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

test(`builds the update action only for a newer version`, async () => {
  const createUpdateNavigationEntry = await loadCreateUpdateNavigationEntry()

  assert.equal(createUpdateNavigationEntry(`1.0.10`, null), null)
  assert.deepEqual(createUpdateNavigationEntry(`1.0.10`, `1.0.11`), {
    label: `Update available!`,
    icon: `fa-download`,
    tooltip: {
      text: `v1.0.10 ->`,
      emphasis: `v1.0.11`,
    },
  })
})

async function loadCreateNavigationEntries(): Promise<(
  isSuperadmin: boolean,
  notificationCount: number,
) => NavEntry[]> {
  const modulePath = './navigationEntries'
  const module = await import(modulePath).catch(() => ({}))
  const createNavigationEntries = Reflect.get(module, 'createNavigationEntries')

  assert.equal(typeof createNavigationEntries, 'function')
  return createNavigationEntries as (
    isSuperadmin: boolean,
    notificationCount: number,
  ) => NavEntry[]
}

async function loadCreateUpdateNavigationEntry(): Promise<(
  currentVersion: string,
  latestVersion: string | null,
) => unknown> {
  const modulePath = './navigationEntries'
  const module = await import(modulePath)
  const createUpdateNavigationEntry = Reflect.get(module, 'createUpdateNavigationEntry')

  assert.equal(typeof createUpdateNavigationEntry, 'function')
  return createUpdateNavigationEntry as (
    currentVersion: string,
    latestVersion: string | null,
  ) => unknown
}
