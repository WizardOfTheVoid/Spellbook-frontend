import assert from 'node:assert/strict'
import test from 'node:test'
import type { AdminUserRecord } from '../../../core'

const users = [
  { id: 1, displayName: `Alpha`, username: `one`, isActive: true, bannedAt: null, teams: [{ id: 4, name: `Knights` }], currentVersion: `3.9`, lastActive: `2026-10-28T23:30:00Z`, createdAt: `2026-10-01T12:00:00Z` },
  { id: 2, displayName: `Alpha`, username: `two`, isActive: false, bannedAt: `2026-10-01`, teams: [], currentVersion: `3.10`, lastActive: `2026-10-28T21:00:00Z`, createdAt: `2026-10-02T12:00:00Z` },
  { id: 3, displayName: `Beta`, username: `three`, isActive: false, bannedAt: null, teams: [{ id: 5, name: `Owners` }], currentVersion: null, lastActive: null, createdAt: `2026-10-03T12:00:00Z` }
] as unknown as AdminUserRecord[]

async function filters() {
  const module = await import(`./userFilters`).catch(() => ({}))
  assert.equal(typeof Reflect.get(module, `filterAndSortUsers`), `function`)
  return module as typeof import('./userFilters')
}

test(`user statuses, search and team filters combine without misclassifying suspended accounts`, async () => {
  const { filterAndSortUsers: filter, defaultUserFilters: base } = await filters()
  const sort = { field: `displayName`, direction: `asc` } as const
  for (const [statuses, expected] of [[[], [2, 1, 3]], [[`enabled`], [1]], [[`suspended`], [2]], [[`awaitingApproval`], [3]], [[`enabled`, `suspended`], [2, 1]]] as const) {
    assert.deepEqual(filter(users, { ...base, statuses: [...statuses] }, sort).map(user => user.id), expected)
  }
  assert.deepEqual(filter(users, { ...base, search: ` @TWO `, statuses: [`suspended`] }, sort).map(user => user.id), [2])
  assert.deepEqual(filter(users, { ...base, teamIds: [4], noTeams: true }, sort).map(user => user.id), [2, 1])
  assert.deepEqual(filter(users, { ...base, teamIds: [4], statuses: [`suspended`] }, sort), [])
})

test(`user date ranges use the selected timezone and exclude unknown activity`, async () => {
  const { filterAndSortUsers: filter, defaultUserFilters: base } = await filters()
  assert.deepEqual(filter(users, { ...base, activeFrom: `2026-10-29`, activeTo: `2026-10-29` }, { field: `lastActive`, direction: `desc` }, `Europe/Oslo`).map(user => user.id), [1])
  assert.deepEqual(filter(users, { ...base, joinedFrom: `2026-10-02`, joinedTo: `2026-10-03` }, { field: `createdAt`, direction: `asc` }).map(user => user.id), [2, 3])
})

test(`version sorting is numeric, nulls remain last in both directions and ties stay stable`, async () => {
  const { filterAndSortUsers: filter, defaultUserFilters: base } = await filters()
  assert.deepEqual(filter(users, base, { field: `currentVersion`, direction: `desc` }).map(user => user.id), [2, 1, 3])
  assert.deepEqual(filter(users, base, { field: `currentVersion`, direction: `asc` }).map(user => user.id), [1, 2, 3])
  assert.deepEqual(filter(users, base, { field: `lastActive`, direction: `asc` }).map(user => user.id), [2, 1, 3])
  assert.deepEqual(filter([...users, { ...users[0], id: 0 }], base, { field: `lastActive`, direction: `desc` }).map(user => user.id), [0, 1, 2, 3])
})
