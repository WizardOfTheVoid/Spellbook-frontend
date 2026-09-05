import assert from 'node:assert/strict'
import test from 'node:test'
import type { GameServerRecord } from '$lib/core'
import { createServerRowStats } from './serverRowStats.js'

test(`creates server row stats without repeating the page refresh time`, () => {
  assert.deepEqual(
    createServerRowStats(server())
      .map(({ id, value }) => ({ id, value })),
    [
      { id: `provider`, value: `Nitrado` },
      { id: `players`, value: `18/40` },
      { id: `region`, value: `EU` },
      { id: `mode`, value: `FFA` }
    ]
  )
})

test(`labels unknown providers and omits unavailable metadata`, () => {
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
    [{ id: `provider`, value: `Unknown` }]
  )
})

function server(): GameServerRecord {
  return {
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
