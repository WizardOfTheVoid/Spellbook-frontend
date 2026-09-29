import assert from 'node:assert/strict'
import test from 'node:test'
import { createDashboardApiSource } from './dashboardApi'

const query = { environment: `global`, period: `30Days`, timeline: `playerActions` } as const
const snapshot = { schemaVersion: 2, query, generatedAt: `2026-09-29T12:00:00.000Z`, viewerId: `user:7`, teams: [],
  live: { admins: 0, servers: 0, players: 73, playerServers: 2, gamePlayers: 5200, avatars: [], latest: null }, scoreboards: { admins: [], teams: [], active: [], viewerRank: {}, protection: null },
  metrics: { accounts: 0, money: 0, cheaterBans: 0, wantedBans: 0, applications: 0, actions: 0, contribution: 0, servers: 0, moneySeries: [] },
  breakdown: { bans: 0, kicks: 0, warnings: 0, unbans: 0, serversay: 0, adminsay: 0 }, timeline: { buckets: [], series: [] },
  coverage: `complete`, coverageDetails: { players: `complete`, messages: `complete`, since: null } }

test(`real source retains known zero and partial data and rejects scope mismatches and API failures`, async () => {
  let data: unknown = snapshot
  let ok = true
  const source = createDashboardApiSource({ get: async () => ({ ok, status: ok ? 200 : 403, data: { ok, data }, error: { message: `Forbidden` } }), timeline: async () => ({ ok: true, status: 200, data: snapshot.timeline }) } as never)
  assert.equal((await source.load(query)).metrics.money, 0)
  assert.equal((await source.load(query)).live.players, 73)
  assert.equal((await source.load(query)).live.playerServers, 2)
  assert.equal((await source.load(query)).live.gamePlayers, 5200)
  data = { ...snapshot, coverage: `partial` }
  assert.equal((await source.load(query)).coverage, `partial`)
  data = { ...snapshot, query: { ...query, environment: `team` } }
  await assert.rejects(source.load(query), /scope/u)
  ok = false
  await assert.rejects(source.load(query), /Forbidden/u)
})

test(`population counts reject missing, fractional and negative API data`, async () => {
  let live: unknown = snapshot.live
  const source = createDashboardApiSource({ get: async () => ({ ok: true, status: 200, data: { ...snapshot, live } }) } as never)
  for (const key of [`players`, `gamePlayers`]) {
    for (const value of [undefined, -1, 1.5]) {
      live = { ...snapshot.live, [key]: value }
      await assert.rejects(source.load(query))
    }
  }
  live = { ...snapshot.live, players: 0, playerServers: 0 }
  assert.equal((await source.load(query)).live.players, 0)
})
