import assert from 'node:assert/strict'
import test from 'node:test'
import type { GameServerRecord } from '$lib/core'
import { createServerRowStats } from './serverRowStats.js'
import { rosterFixture } from '../serverStore/serverStoreFixtures.js'
import { expireSummary } from '../serverStore/liveSummary.js'

test(`creates server row stats without repeating the page refresh time`, () => {
  assert.deepEqual(
    createServerRowStats({ ...server(), mapName: `FFA_Arena` })
      .map(({ id, value }) => ({ id, value })),
    [
      { id: `players`, value: `18/40` },
      { id: `region`, value: `EU` },
      { id: `mode`, value: `Duels` },
      { id: `ping`, value: `—` }
    ]
  )
})

test(`derives row modes from map names and reported titles in rule order`, () => {
  const cases = [
    [true, `Social Mixed Duels`, `FFA_Arena`, `Social`],
    [false, `Social`, `FFA_Arena`, `FFA`],
    [false, `DUEL server`, `FFA_Arena`, `Duels`],
    [true, `1v1 server`, `FFA_Arena`, `Duels`],
    [false, `1 V 1 server`, `FFA_Arena`, `Duels`],
    [false, `Flourish before combat`, `/Game/Maps/FFA_Arena.FFA_Arena`, `Duels`],
    [false, `Free for all`, `ffa_arena`, `FFA`],
    [true, `Mixed rotation`, `TO_Rudhelm`, `Mixed`],
    [true, `Mixed Duels`, `FFA_Arena`, `Duels`],
    [false, `Mixed rotation`, `TO_Rudhelm`, `TO`],
    [false, `Duel server`, `/Game/FFA_Maps/TO_Rudhelm`, `TO`],
    [true, `Team battle`, `LTS_Wardenglade`, `LTS`],
    [false, `Duel server`, null, null],
    [false, `Social`, `Other_Arena`, null]
  ] as const
  for (const [official, name, mapName, mode] of cases) {
    const stats = createServerRowStats({ ...server(), official, name, mapName, gameMode: `Unreliable` })
    assert.equal(stats.find(stat => stat.id === `mode`)?.value ?? null, mode, `${name}: ${mapName}`)
  }
})

test(`omits unavailable metadata`, () => {
  assert.deepEqual(
    createServerRowStats({
      ...server(),
      official: null,
      currentPlayerCount: null,
      maxPlayers: null,
      region: null,
      gameMode: null,
      lastSeen: null
    }).map(({ id, value }) => ({ id, value })),
    [{ id: `ping`, value: `—` }]
  )
})

test(`server ping displays milliseconds including zero and hides unavailable or expired samples`, () => {
  const live = rosterFixture().roster
  for (const [ping, fresh, value] of [[0, true, `0 ms`], [23.6, true, `24 ms`], [null, true, `—`], [20, false, `—`]] as const) {
    const data = { ...server(), live: { ...live, ping, sources: { ...live.sources, a2s: { ...live.sources.a2s, fresh } } } }
    assert.equal(createServerRowStats(data).find(stat => stat.id === `ping`)?.value, value)
  }
  const expired = expireSummary(live, 1000, 61000)
  assert.equal(createServerRowStats({ ...server(), live: expired }).find(stat => stat.id === `ping`)?.value, `—`)
})

function server(): GameServerRecord {
  return {
    geoLatitude: null, geoLongitude: null, geoAccuracyRadiusKm: null, geoCountryCode: null,
    geoCity: null, geoTimezone: null, geoSource: null, geoCheckedAt: null,
    ownerTeamId: null,
    id: 7,
    externalId: `lobby-7`,
    name: `Duel`,
    displayName: null,
    clanName: null,
    clanTag: null,
    region: `EU`,
    mapName: null,
    gameMode: `FFA`,
    buildId: null,
    host: null,
    port: null,
    queryPort: null,
    pingPort: null,
    serverHostname: null,
    maxPlayers: 40,
    currentPlayerCount: 18,
    official: false,
    platform: null,
    buildVersion: null,
    runTime: null,
    gameServerState: null,
    lastHeartbeat: null,
    lastSeen: `2026-08-29T10:00:00.000Z`,
    deletedAt: null,
    createdAt: `2026-08-01T00:00:00.000Z`
  }
}
