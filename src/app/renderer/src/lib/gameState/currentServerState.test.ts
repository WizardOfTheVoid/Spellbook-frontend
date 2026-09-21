import assert from 'node:assert/strict'
import test from 'node:test'
import { get } from 'svelte/store'
import type { ActiveServerProfile, CurrentGameSnapshot, DbPlayerListItem } from '$lib/core'
import { createCurrentServerStore } from './currentServerState'

const snapshot = (version = 1, externalId = `server-a`): CurrentGameSnapshot => ({
  version, externalId, gameServerId: 1, serverName: `Duel`, serverAddress: `localhost`,
  observedAt: `2026-09-13T12:00:00Z`, parseWarnings: [],
  players: [{ index: 0, name: `Live name`, playfabId: `p1`, kills: version, rawLine: `p1` }]
})
const player = { id: 1, playfabId: `p1`, latestName: `Stored name`, latestNormalizedName: `normalized` } as DbPlayerListItem
const profile = { gameServer: { name: `Duel`, displayName: `My server` } } as ActiveServerProfile
const flush = async () => { for (let index = 0; index < 12; index++) await Promise.resolve() }

function fixture(hydrate: () => Promise<CurrentGameSnapshot | null> = async () => snapshot()) {
  let listener: ((value: CurrentGameSnapshot | null) => void) | null = null
  const calls: string[][] = []
  const profiles: string[] = []
  let loadPlayers = async (_ids: string[]) => [player]
  let loadProfile = async (_id: string) => profile
  let enrichPlayers = async (_ids: string[]): Promise<number[]> => []
  const enrichments: string[][] = []
  const store = createCurrentServerStore({
    api: () => ({ currentGameSnapshot: hydrate, onCurrentGameSnapshot: callback => {
      listener = callback
      return () => { listener = null }
    } }),
    loadPlayers: async ids => { calls.push(ids); return loadPlayers(ids) },
    enrichPlayers: async ids => { enrichments.push(ids); return enrichPlayers(ids) },
    loadProfile: async id => { profiles.push(id); return loadProfile(id) }
  })
  return { store, calls, profiles, enrichments, emit: (value: CurrentGameSnapshot | null) => listener?.(value),
    enrich: (load: typeof enrichPlayers) => { enrichPlayers = load },
    players: (load: typeof loadPlayers) => { loadPlayers = load },
    profile: (load: typeof loadProfile) => { loadProfile = load } }
}

test(`Sign-in hydrates an unfiltered roster and active profile without a page`, async () => {
  const f = fixture()
  f.store.sync(1)
  await flush()
  assert.deepEqual(f.calls, [[`p1`]])
  assert.deepEqual(f.profiles, [`server-a`])
  assert.equal(get(f.store).players[0]?.name, `Live name`)
  assert.equal(get(f.store).players[0]?.normalizedName, `normalized`)
  assert.equal(get(f.store).activeProfile, profile)
  f.emit({ ...snapshot(2), players: [] })
  await flush()
  assert.deepEqual(get(f.store).players, [])
  assert.equal(f.calls.length, 1)
  f.store.sync(null)
})

test(`missing XP is enriched after display and refreshes DB players without losing live stats`, async () => {
  const f = fixture()
  let finish!: (ids: number[]) => void
  f.enrich(() => new Promise(resolve => { finish = resolve }))
  f.store.sync(1)
  await flush()
  assert.equal(get(f.store).playerState, `ok`)
  assert.equal(get(f.store).players[0]?.name, `Live name`)
  assert.deepEqual(f.enrichments, [[`p1`]])
  f.emit(snapshot(2))
  await flush()
  assert.equal(f.enrichments.length, 1)
  f.players(async () => [{ ...player, rank: 50 }])
  finish([1])
  await flush()
  assert.equal(get(f.store).players[0]?.rank, 50)
  assert.equal(get(f.store).players[0]?.kills, 2)
  assert.equal(f.enrichments.length, 1)
  f.store.sync(null)
})

test(`known rank zero does not trigger XP enrichment`, async () => {
  const f = fixture()
  f.players(async () => [{ ...player, rank: 0 }])
  f.store.sync(1)
  await flush()
  assert.deepEqual(f.enrichments, [])
  f.store.sync(null)
})

test(`unavailable XP does not loop or turn a loaded roster into an error`, async () => {
  const f = fixture()
  f.enrich(async () => { throw new Error(`unavailable`) })
  f.store.sync(1)
  await flush()
  assert.equal(f.enrichments.length, 1)
  assert.equal(f.calls.length, 1)
  assert.equal(get(f.store).playerState, `ok`)
  assert.equal(get(f.store).error, null)
  f.store.sync(null)
})

test(`late XP completion cannot refresh a different server or signed-out roster`, async () => {
  for (const disconnect of [true, false]) {
    const f = fixture()
    let finish!: (ids: number[]) => void
    f.enrich(() => new Promise(resolve => { finish = resolve }))
    f.store.sync(1)
    await flush()
    if (disconnect) f.store.sync(null)
    else {
      f.players(async () => [{ ...player, rank: 99 }])
      f.emit(snapshot(2, `server-b`))
    }
    await flush()
    const calls = f.calls.length
    finish([1])
    await flush()
    assert.equal(f.calls.length, calls)
    assert.equal(get(f.store).snapshot?.externalId ?? null, disconnect ? null : `server-b`)
    f.store.sync(null)
  }
})

test(`A disconnect rejects late hydration, roster and profile responses`, async () => {
  let hydrate!: (value: CurrentGameSnapshot | null) => void
  let players!: (value: DbPlayerListItem[]) => void
  let profiles!: (value: ActiveServerProfile) => void
  const f = fixture(() => new Promise(resolve => { hydrate = resolve }))
  f.players(() => new Promise(resolve => { players = resolve }))
  f.profile(() => new Promise(resolve => { profiles = resolve }))
  f.store.sync(1)
  f.emit(snapshot(2))
  f.emit(null)
  hydrate(snapshot(1))
  players([player])
  profiles(profile)
  await flush()
  assert.equal(get(f.store).snapshot, null)
  assert.deepEqual(get(f.store).players, [])
  assert.equal(get(f.store).activeProfile, null)
  f.store.sync(null)
})

test(`Rapid snapshots coalesce enrichment while retaining the newest live stats`, async () => {
  const f = fixture()
  let finish!: (value: DbPlayerListItem[]) => void
  f.players(() => new Promise(resolve => { finish = resolve }))
  f.store.sync(1)
  await flush()
  f.emit(snapshot(2))
  f.emit(snapshot(3))
  assert.equal(f.calls.length, 1)
  f.players(async () => [player])
  finish([player])
  await flush()
  assert.equal(f.calls.length, 2)
  assert.equal(get(f.store).players[0]?.kills, 3)
  assert.equal(f.profiles.length, 1)
  f.store.sync(null)
})

test(`Server changes and sign-out cannot retain another server's profile or players`, async () => {
  const f = fixture()
  f.store.sync(1)
  await flush()
  f.profile(async () => { throw new Error(`unavailable`) })
  f.players(async () => { throw new Error(`unavailable`) })
  f.emit(snapshot(2, `server-b`))
  assert.deepEqual(get(f.store).players, [])
  assert.equal(get(f.store).activeProfile, null)
  await flush()
  assert.equal(get(f.store).snapshot?.externalId, `server-b`)
  assert.equal(get(f.store).playerState, `error`)
  f.store.sync(null)
  assert.equal(get(f.store).snapshot, null)
})

test(`Transient enrichment failure preserves the current roster and preference changes reload its profile`, async () => {
  const f = fixture()
  f.store.sync(1, `0`)
  await flush()
  f.players(async () => { throw new Error(`temporary`) })
  f.emit(snapshot(2))
  await flush()
  assert.equal(get(f.store).players[0]?.kills, 2)
  f.store.sync(1, `1`)
  await flush()
  assert.equal(f.profiles.length, 2)
  f.store.sync(null)
})
