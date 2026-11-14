import assert from 'node:assert/strict'
import test from 'node:test'
import { ServerStoreCache } from './serverStoreCache'
import { serverStorePlayers } from './serverStorePlayers'
import { rosterFixture } from './serverStoreFixtures'
import type { GameServerPlayers } from '$lib/core'

test(`a forced refresh waits for an existing read then fetches the new observation`, async () => {
  let calls = 0
  let finish!: (data: GameServerPlayers) => void
  const cache = new ServerStoreCache({ presence: async () => ({}), roster: async () => {
    calls++
    if (calls === 1) return new Promise(resolve => { finish = resolve })
    const next = rosterFixture()
    next.roster.players = []
    return next
  } })
  const first = cache.roster(1)
  const forced = cache.roster(1, true)
  assert.equal(calls, 1)
  finish(rosterFixture())
  await first
  assert.equal((await forced).roster.players.length, 0)
  assert.equal(calls, 2)
})

test(`expired A2S durations and bots clear while a newer ListPlayers roster stays online`, async () => {
  let now = 0
  const data = rosterFixture()
  data.roster.sources.a2s = { ...data.roster.sources.a2s, expiresAt: new Date(2000).toISOString() }
  data.roster.bots = [{ ...data.roster.players[0], key: `bot`, name: `Bot`, bot: true, playerId: null, playfabId: null, identity: `unknown` }]
  const cache = new ServerStoreCache({ now: () => now, presence: async () => ({}), roster: async () => data })
  await cache.roster(1)
  now = 1000
  const current = cache.peek(1)!
  assert.equal(current.roster.status, `fresh`)
  assert.equal(current.roster.players[0].durationSeconds, null)
  assert.equal(serverStorePlayers(current)[0].isOnline, true)
  assert.deepEqual(current.roster.bots, [])
})

test(`concurrent current, selected and Quick Open reads share one request and expire without new revisions`, async () => {
  let now = 0
  let calls = 0
  let finish!: (data: GameServerPlayers) => void
  const cache = new ServerStoreCache({ now: () => now, presence: async () => ({}),
    roster: async () => {
      calls++
      return new Promise(resolve => { finish = resolve })
    } })
  cache.sync(`session`)
  const requests = [cache.roster(1), cache.roster(1), cache.roster(1)]
  assert.equal(calls, 1)
  finish(rosterFixture())
  await Promise.all(requests)
  assert.equal((await cache.roster(1)).roster.players.length, 1)
  assert.equal(calls, 1)
  now = 60000
  assert.equal(cache.peek(1)!.roster.status, `stale`)
  assert.equal(serverStorePlayers(cache.peek(1)!)[0].isOnline, false)
})

test(`account changes and travel invalidate late requests; permission failure removes cached rows`, async () => {
  let finish!: (data: GameServerPlayers) => void
  let fail = false
  const cache = new ServerStoreCache({ presence: async () => ({}), roster: async () => {
    if (fail) throw new Error(`Forbidden`)
    return new Promise(resolve => { finish = resolve })
  } })
  cache.sync(`first`)
  const old = cache.roster(1)
  cache.sync(`second`)
  finish(rosterFixture())
  await assert.rejects(old, /superseded/)
  assert.equal(cache.peek(1), null)
  const next = cache.roster(1)
  finish(rosterFixture())
  await next
  fail = true
  await assert.rejects(cache.roster(1, true), /Forbidden/)
  assert.equal(cache.peek(1), null)
})

test(`new epoch clears other servers and prevents older responses from restoring them`, async () => {
  const cache = new ServerStoreCache({ presence: async () => ({}), roster: async id => ({ ...rosterFixture(id === 3 ? `new` : `old`), roster: { ...rosterFixture(id === 3 ? `new` : `old`).roster, gameServerId: id } }) })
  await cache.roster(1)
  await cache.roster(2)
  await cache.roster(3)
  assert.equal(cache.peek(1), null)
  assert.equal(cache.peek(2), null)
  assert.equal(cache.peek(3)!.roster.epoch, `new`)
})

test(`missing DB enrichment and unidentified observations remain distinct with no invented account`, () => {
  const data = rosterFixture()
  data.roster.players.push(...[0, 1].map(index => ({ ...data.roster.players[0], key: `unknown-${index}`, name: `Same`, playfabId: null, playerId: null, identity: `unknown` as const })))
  const players = serverStorePlayers(data)
  assert.equal(players.length, 3)
  assert.equal(players[0].dbPlayer, null)
  assert.equal(players[0].playfabId, `ABC`)
  assert.deepEqual(players.slice(1).map(player => player.playfabId), [``, ``])
  assert.notEqual(players[1].liveKey, players[2].liveKey)
})
