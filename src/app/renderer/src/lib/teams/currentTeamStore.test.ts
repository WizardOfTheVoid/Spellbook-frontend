import assert from 'node:assert/strict'
import test from 'node:test'
import { get } from 'svelte/store'
import type { TeamListRecord } from '$lib/core'
import { createCurrentTeamStore } from './currentTeamStore'

const team = (id: number, permissions = [`admin`]): TeamListRecord => ({ id, name: `Team ${id}`, ownerUserId: 1, permissions, memberCount: 2, claimedServerCount: 1, profileCount: 1 })
async function fixture(loadTeams = async () => [team(3), team(7)]) {
  const saved = new Map<string, string>([[`spellbook:currentTeam:1`, `7`]])
  const store = createCurrentTeamStore({ loadTeams, storage: () => ({ getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value), removeItem: (key: string) => saved.delete(key) }) })
  return { store, saved }
}

test(`restores a validated per-account team and rejects unreadable or foreign choices`, async () => {
  const { store, saved } = await fixture(async () => [team(3), team(7), team(8, []), { ...team(9), isMember: false }])
  store.syncUser(1)
  await store.refresh()
  assert.equal(get(store).currentTeamId, 7)
  assert.equal(store.select(8), false)
  assert.equal(store.select(9), false)
  assert.equal(store.select(3), true)
  assert.equal(saved.get(`spellbook:currentTeam:1`), `3`)
  store.syncUser(2)
  await store.refresh()
  assert.equal(get(store).currentTeamId, null)
  assert.equal(saved.get(`spellbook:currentTeam:1`), `3`)
})

test(`selects a server team once per visit and keeps manual selection through refreshes`, async () => {
  const { store } = await fixture()
  store.syncUser(1)
  await store.refresh()
  const observation = { connectionKey: `server-a`, ownerTeamId: 3, ownershipResolved: true }
  store.observeServer(observation)
  assert.equal(get(store).currentTeamId, 3)
  store.select(7)
  store.observeServer({ ...observation, ownershipResolved: false })
  store.observeServer(observation)
  assert.equal(get(store).currentTeamId, 7)
  store.observeServer({ connectionKey: null, ownerTeamId: null, ownershipResolved: false })
  store.observeServer(observation)
  assert.equal(get(store).currentTeamId, 3)
})

test(`a manual choice defeats delayed ownership and a failed refresh keeps validated selection`, async () => {
  let fail = false
  const { store } = await fixture(async () => { if (fail) throw new Error(`Offline`); return [team(3), team(7)] })
  store.syncUser(1)
  await store.refresh()
  store.observeServer({ connectionKey: `server-a`, ownerTeamId: null, ownershipResolved: false })
  store.select(7)
  store.observeServer({ connectionKey: `server-a`, ownerTeamId: 3, ownershipResolved: true })
  assert.equal(get(store).currentTeamId, 7)
  fail = true
  await store.refresh()
  assert.equal(get(store).currentTeamId, 7)
  assert.equal(get(store).error, `Offline`)
})

test(`removes invalidated selections and ignores responses from a previous login`, async () => {
  let finish!: (value: TeamListRecord[]) => void
  let rows = [team(3), team(7)]
  const { store, saved } = await fixture(async () => rows)
  store.syncUser(1)
  await store.refresh()
  rows = [team(3)]
  await store.refresh()
  assert.equal(get(store).currentTeamId, null)
  assert.equal(saved.has(`spellbook:currentTeam:1`), false)
  const deferred = await fixture(() => new Promise(resolve => { finish = resolve }))
  deferred.store.syncUser(1)
  deferred.store.syncUser(null)
  finish([team(7)])
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(get(deferred.store).userId, null)
  assert.deepEqual(get(deferred.store).teams, [])
})

test(`a pending membership refresh coalesces and storage failures do not prevent selection`, async () => {
  let calls = 0
  const store = createCurrentTeamStore({ loadTeams: async () => { calls++; return [team(3)] }, storage: () => { throw new Error(`Storage unavailable`) } })
  store.syncUser(1)
  await Promise.all([store.refresh(), store.refresh()])
  assert.equal(calls, 1)
  assert.equal(store.select(3), true)
  assert.equal(get(store).currentTeamId, 3)
})

test(`manual selections emit a new intent even for the same team; automatic selections do not`, async () => {
  const { store } = await fixture()
  store.syncUser(1)
  await store.refresh()
  assert.equal(get(store).selectionRevision, 0)
  store.select(7)
  store.select(7)
  assert.equal(get(store).selectionRevision, 2)
  store.observeServer({ connectionKey: `dr3`, ownerTeamId: 3, ownershipResolved: true })
  assert.equal(get(store).currentTeamId, 3)
  assert.equal(get(store).selectionRevision, 2)
  store.syncUser(null)
  assert.equal(get(store).selectionRevision, 0)
})

test(`fresh request counts update only the matching account's administered team`, async () => {
  const { store } = await fixture(async () => [team(3), team(7, [`read`])])
  store.syncUser(1)
  await store.refresh()
  assert.equal(store.updateRequestCount(3, 5, 1), true)
  assert.equal(get(store).teams.find(team => team.id === 3)?.pendingRequestCount, 5)
  assert.equal(store.updateRequestCount(3, 0, 1), true)
  assert.equal(get(store).teams.find(team => team.id === 3)?.pendingRequestCount, 0)
  assert.equal(store.updateRequestCount(3, -1, 1), false)
  assert.equal(store.updateRequestCount(3, 9, 2), false)
  assert.equal(store.updateRequestCount(7, 8, 1), false)
})
