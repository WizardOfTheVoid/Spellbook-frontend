import assert from 'node:assert/strict'
import test from 'node:test'
import type { GameServerRecord } from '$lib/core'
import {
  buildProfileServerOptions,
  reconcileProfileServerAssignments
} from './profileManagement.js'

test('server options disable assignments owned by any other profile', () => {
  const options = buildProfileServerOptions(
    [
      gameServer(10, `Occupied`),
      gameServer(20, `Current`),
      gameServer(30, `Available`)
    ],
    [
      { gameServerId: 10, profileId: 99, profileName: 'Team profile' },
      { gameServerId: 20, profileId: 7, profileName: 'Current profile' }
    ],
    7
  )

  assert.deepEqual(options, [
    { value: '10', label: 'Occupied', description: 'Assigned to Team profile', disabled: true },
    { value: '20', label: 'Current', description: 'Current', disabled: false },
    { value: '30', label: 'Available', description: 'Available', disabled: false }
  ])
})

test('server selection preserves assignments hidden by the eligible server filter', () => {
  const current = [
    { id: 1, owner: { type: 'user' as const, id: 5 }, profileId: 7, gameServerId: 10, gameServerName: 'Eligible' },
    { id: 2, owner: { type: 'user' as const, id: 5 }, profileId: 7, gameServerId: 20, gameServerName: 'Official' },
    { id: 3, owner: { type: 'user' as const, id: 5 }, profileId: 7, gameServerId: 30, gameServerName: 'Deleted' }
  ]

  const assignments = reconcileProfileServerAssignments(
    current,
    [gameServer(10, `Eligible`), gameServer(40, `New eligible`)],
    new Set([40]),
    { type: 'user', id: 5 },
    7
  )

  assert.deepEqual(assignments, [
    current[1],
    current[2],
    { id: 0, owner: { type: 'user', id: 5 }, profileId: 7, gameServerId: 40, gameServerName: 'New eligible' }
  ])
})

function gameServer(id: number, name: string): GameServerRecord {
  return {
    id,
    externalId: `lobby-${id}`,
    name,
    displayName: null,
    clanName: null,
    clanTag: null,
    region: null,
    mapName: null,
    gameMode: null,
    buildId: null,
    host: null,
    port: null,
    queryPort: null,
    pingPort: null,
    serverHostname: null,
    maxPlayers: null,
    official: null,
    platform: null,
    buildVersion: null,
    runTime: null,
    gameServerState: null,
    lastHeartbeat: null,
    lastSeen: null,
    deletedAt: null,
    createdAt: `2026-08-01T00:00:00.000Z`
  }
}
