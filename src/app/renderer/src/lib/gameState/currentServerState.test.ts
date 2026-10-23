import assert from 'node:assert/strict'
import test from 'node:test'
import { get } from 'svelte/store'
import type { ActiveServerProfile, CurrentGameSnapshot, GameServerPlayers } from '$lib/core'
import { createCurrentServerStore } from './currentServerState'
import { rosterFixture } from '$lib/serverStore/serverStoreFixtures'

const snapshot = (version = 1, id = 1): CurrentGameSnapshot => ({
  version, externalId: `server-${id}`, gameServerId: id, serverName: `Duel`, serverAddress: `localhost`,
  observedAt: `2026-09-13T12:00:00Z`, parseWarnings: [],
  players: [{ index: 0, name: `Local only`, playfabId: `local`, rawLine: `local` }]
})
const flush = async () => { for (let index = 0; index < 12; index++) await Promise.resolve() }

function fixture(hydrate: () => Promise<CurrentGameSnapshot | null> = async () => snapshot()) {
  let listener: ((value: CurrentGameSnapshot | null) => void) | null = null
  const calls: number[] = []
  const profileCalls: string[] = []
  let load = async (_id: number): Promise<GameServerPlayers> => rosterFixture()
  let profile = async (_id: string): Promise<ActiveServerProfile> => ({}) as ActiveServerProfile
  const store = createCurrentServerStore({
    api: () => ({ currentGameSnapshot: hydrate, onCurrentGameSnapshot: callback => {
      listener = callback
      return () => { listener = null }
    } }),
    loadRoster: async id => { calls.push(id); return load(id) },
    loadProfile: async id => { profileCalls.push(id); return profile(id) }
  })
  return { store, calls, profileCalls, emit: (value: CurrentGameSnapshot | null) => listener?.(value),
    load: (next: typeof load) => { load = next }, profile: (next: typeof profile) => { profile = next } }
}

test(`local connection selects the shared roster; local snapshot players never become display data`, async t => {
  const f = fixture()
  t.after(() => f.store.sync(null))
  f.store.sync(1)
  await flush()
  assert.deepEqual(f.calls, [1])
  assert.deepEqual(get(f.store).players.map(player => player.name), [`Canonical`])
  assert.equal(get(f.store).players[0].playfabId, `ABC`)
  f.emit(null)
  assert.deepEqual(get(f.store).players, [])
})

test(`travel and logout discard late roster responses`, async t => {
  for (const logout of [false, true]) {
    const f = fixture()
    t.after(() => f.store.sync(null))
    let finish!: (data: GameServerPlayers) => void
    f.load(() => new Promise(resolve => { finish = resolve }))
    f.store.sync(1)
    await flush()
    if (logout) f.store.sync(null)
    else {
      f.load(async () => ({ ...rosterFixture(), roster: { ...rosterFixture().roster, gameServerId: 2, players: [] } }))
      f.emit(snapshot(2, 2))
    }
    finish(rosterFixture())
    await flush()
    assert.deepEqual(get(f.store).players, [])
    assert.equal(get(f.store).snapshot?.gameServerId ?? null, logout ? null : 2)
  }
})

test(`a delayed hydration cannot restore a cleared connection`, async t => {
  let finish!: (snapshot: CurrentGameSnapshot | null) => void
  const f = fixture(() => new Promise(resolve => { finish = resolve }))
  t.after(() => f.store.sync(null))
  f.store.sync(1)
  f.emit(null)
  finish(snapshot())
  await flush()
  assert.equal(get(f.store).snapshot, null)
  assert.deepEqual(f.calls, [])
})

const activeProfile = (value: string) => ({ variables: [{ label: `Rules`, key: `rules`, value }] }) as ActiveServerProfile
const rules = (f: ReturnType<typeof fixture>) => get(f.store).activeProfile?.variables[0]?.value

test(`connected clients refresh Team changes every thirty seconds and immediately after a local revision`, async t => {
  t.mock.timers.enable({ apis: [`Date`, `setInterval`], now: 0 })
  const f = fixture()
  t.after(() => f.store.sync(null))
  let value = `original`
  f.profile(async () => activeProfile(value))
  f.store.sync(1, `0`)
  await flush()
  assert.equal(rules(f), `original`)
  value = `another admin saved`
  t.mock.timers.tick(29_999)
  await flush()
  assert.equal(f.profileCalls.length, 1)
  t.mock.timers.tick(1)
  await flush()
  assert.equal(rules(f), value)
  assert.equal(f.profileCalls.length, 2)
  value = `local save`
  f.store.sync(1, `1`)
  await flush()
  assert.equal(rules(f), value)
  assert.equal(f.profileCalls.length, 3)
})

test(`overlapping profile refreshes coalesce and a local revision discards the pending values before reloading`, async t => {
  const f = fixture()
  t.after(() => f.store.sync(null))
  let finish!: (profile: ActiveServerProfile) => void
  f.profile(() => new Promise(resolve => { finish = resolve }))
  f.store.sync(1, `0`)
  await flush()
  const first = f.store.refreshProfile()
  const second = f.store.refreshProfile()
  assert.equal(f.profileCalls.length, 1)
  f.store.sync(1, `1`)
  f.profile(async () => activeProfile(`updated`))
  finish(activeProfile(`stale`))
  await Promise.all([first, second])
  await flush()
  assert.equal(rules(f), `updated`)
  assert.equal(f.profileCalls.length, 2)
})

test(`travel, disconnect and logout discard late profile responses and refresh errors clear stale values`, async t => {
  for (const change of [`travel`, `disconnect`, `logout`]) {
    const f = fixture()
    t.after(() => f.store.sync(null))
    let finish!: (profile: ActiveServerProfile) => void
    f.profile(() => new Promise(resolve => { finish = resolve }))
    f.store.sync(1)
    await flush()
    if (change === `logout`) f.store.sync(null)
    else if (change === `disconnect`) f.emit(null)
    else {
      f.profile(async () => activeProfile(`new server`))
      f.emit(snapshot(2, 2))
    }
    finish(activeProfile(`old server`))
    await flush()
    assert.equal(rules(f), change === `travel` ? `new server` : undefined)
  }
  const f = fixture()
  t.after(() => f.store.sync(null))
  f.profile(async () => activeProfile(`current`))
  f.store.sync(1)
  await flush()
  f.profile(async () => { throw new Error(`Unavailable`) })
  await f.store.refreshProfile()
  assert.equal(get(f.store).activeProfile, null)
})
