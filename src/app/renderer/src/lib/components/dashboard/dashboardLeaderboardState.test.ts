import assert from 'node:assert/strict'
import test from 'node:test'
import { createDashboardLeaderboardState, type DashboardLeaderboardState } from './dashboardLeaderboardState'
import type { DashboardLeaderboardQuery, DashboardLeaderboardPage } from './dashboardViewModel'

test(`pages within a fixed snapshot, bounds page requests, and refreshes the snapshot`, async () => {
  const requests: DashboardLeaderboardQuery[] = []
  let state: DashboardLeaderboardState | null = null
  const source = { loadLeaderboard: async (query: DashboardLeaderboardQuery): Promise<DashboardLeaderboardPage> => {
    requests.push(query)
    return { rows: [], page: query.page, pageSize: 10, total: 22, asOf: query.asOf ?? `2026-09-29T12:00:00Z` }
  } }
  const controller = createDashboardLeaderboardState({ kind: `admins`, source, onChange: value => { state = value } })
  await controller.start()
  assert.equal(requests.length, 1)
  await controller.setPage(2)
  assert.equal(requests[1].asOf, `2026-09-29T12:00:00Z`)
  await controller.setPage(99)
  assert.equal(requests.length, 2)
  await controller.refresh()
  assert.equal(requests[2].asOf, null)
  assert.equal(requests[2].page, 1)
  assert.equal((state as DashboardLeaderboardState | null)?.error, null)
  controller.destroy()
})

test(`ignores an older page response and late completion after leaving the ranking`, async () => {
  const requests: { query: DashboardLeaderboardQuery, resolve: (page: DashboardLeaderboardPage) => void }[] = []
  const states: DashboardLeaderboardState[] = []
  const source = { loadLeaderboard: async (query: DashboardLeaderboardQuery) => await new Promise<DashboardLeaderboardPage>(resolve => { requests.push({ query, resolve }) }) }
  const controller = createDashboardLeaderboardState({ kind: `admins`, source, onChange: value => states.push(value) })
  const page = (index: number) => ({ rows: [], page: index, pageSize: 10, total: 22, asOf: `2026-09-29T12:00:00Z` })
  const initial = controller.start()
  requests[0].resolve(page(1))
  await initial
  const second = controller.setPage(2)
  const third = controller.setPage(3)
  requests[2].resolve(page(3))
  await third
  requests[1].resolve(page(2))
  await second
  assert.equal(states.at(-1)?.data?.page, 3)
  const refresh = controller.refresh()
  const emitted = states.length
  controller.destroy()
  requests[3].resolve(page(1))
  await refresh
  assert.equal(states.length, emitted)
})

test(`retains the prior ranking page when a later request fails`, async () => {
  const states: DashboardLeaderboardState[] = []
  const source = { loadLeaderboard: async (query: DashboardLeaderboardQuery) => {
    if (query.page > 1) throw new Error(`Offline`)
    return { rows: [], page: 1, pageSize: 10, total: 22, asOf: `2026-09-29T12:00:00Z` }
  } }
  const controller = createDashboardLeaderboardState({ kind: `teams`, source, onChange: value => states.push(value) })
  await controller.start()
  await controller.setPage(2)
  assert.equal(states.at(-1)?.data?.page, 1)
  assert.equal(states.at(-1)?.error, `Offline`)
  assert.equal(states.at(-1)?.loading, false)
  controller.destroy()
})
