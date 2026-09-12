import assert from 'node:assert/strict'
import test from 'node:test'
import type { GameServerRecord } from '$lib/core'
import {
  buildProfileServerOptions,
  eligibleProfileServers,
  canTransferProfileOwner,
  reconcileProfileServerAssignments
} from './profileManagement.js'

test('server options disable assignments owned by any other profile', () => {
  const options = buildProfileServerOptions(
    [
      gameServer(10, `Occupied`),
      gameServer(20, `Current`),
      { ...gameServer(30, `Raw available`), displayName: `Available` }
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

test(`personal selections and team claims only conflict within their own scope`, () => {
  const assignments = [
    { gameServerId: 10, profileId: 1, profileName: `Team`, owner: { type: `team` as const, id: 8 } },
    { gameServerId: 20, profileId: 2, profileName: `Personal`, owner: { type: `user` as const, id: 7 } },
  ]
  const servers = [gameServer(10, `Team server`), gameServer(20, `Personal server`)].map(server => ({ ...server, ownerTeamId: 8 }))
  assert.deepEqual(buildProfileServerOptions(servers, assignments, 3, { type: `user`, id: 7 }, [8]).map(option => option.disabled), [false, true])
  assert.deepEqual(buildProfileServerOptions(servers, assignments, 3, { type: `user`, id: 9 }, [8]).map(option => option.disabled), [false, false])
  assert.deepEqual(buildProfileServerOptions(servers, assignments, 3, { type: `team`, id: 9 }), [])
})

test(`private profiles can select only servers owned by their member teams`, () => {
  const owner = { type: `user` as const, id: 7 }
  const servers = [
    { ...gameServer(1, `First team`), ownerTeamId: 8 },
    { ...gameServer(2, `Second team`), ownerTeamId: 9 },
    { ...gameServer(3, `Unrelated team`), ownerTeamId: 10 },
    gameServer(4, `Unclaimed`)
  ]
  assert.deepEqual(eligibleProfileServers(servers, owner, [8, 9]).map(server => server.id), [1, 2])
  assert.deepEqual(eligibleProfileServers(servers, owner), [])
  assert.deepEqual(eligibleProfileServers(servers, { type: `team`, id: 8 }, [9]).map(server => server.id), [1])
  assert.deepEqual(buildProfileServerOptions(servers, [], 7, owner, [8, 9]).map(option => option.value), [`1`, `2`])
})

test(`private selection changes preserve unavailable assignments while they remain selected`, () => {
  const owner = { type: `user` as const, id: 7 }
  const servers = [
    { ...gameServer(1, `Current team`), ownerTeamId: 8 },
    { ...gameServer(2, `Former team`), ownerTeamId: 9 },
    gameServer(3, `Released claim`),
    { ...gameServer(4, `New selection`), ownerTeamId: 8 }
  ]
  const current = servers.slice(0, 3).map(server => ({
    id: server.id, owner, profileId: 7, gameServerId: server.id, gameServerName: server.name
  }))
  const selected = reconcileProfileServerAssignments(current, eligibleProfileServers(servers, owner, [8]), new Set([2, 3, 4]), owner, 7)
  assert.deepEqual(selected.map(server => server.gameServerId), [2, 3, 4])
  assert.equal(selected[0], current[1])
  assert.equal(selected[1], current[2])
})

test(`team profiles select only their own claims and preserve unavailable attachments`, () => {
  const owner = { type: `team` as const, id: 8 }
  const servers = [
    { ...gameServer(10, `Occupied`), ownerTeamId: 8 },
    { ...gameServer(20, `Available`), ownerTeamId: 8 },
    { ...gameServer(30, `Other team`), ownerTeamId: 9 },
    gameServer(40, `Unclaimed`)
  ]
  const assignments = [{ owner, gameServerId: 10, profileId: 99, profileName: `Another profile` }]
  assert.deepEqual(buildProfileServerOptions(servers, assignments, 7, owner).map(({ value, disabled }) => ({ value, disabled })), [
    { value: `10`, disabled: true }, { value: `20`, disabled: false }
  ])
  const hidden = { id: 1, owner, profileId: 7, gameServerId: 50, gameServerName: `Hidden` }
  const selected = reconcileProfileServerAssignments([hidden], eligibleProfileServers(servers, owner), new Set([50, 20, 30, 40]), owner, 7)
  assert.deepEqual(selected.map(item => item.gameServerId), [50, 20])
  assert.equal(selected[0], hidden)
})

test(`owner transfers involving teams require saved attachments to be removed`, () => {
  const team = { type: `team` as const, id: 8 }
  const otherTeam = { type: `team` as const, id: 9 }
  const user = { type: `user` as const, id: 7 }
  assert.equal(canTransferProfileOwner(team, otherTeam, 1), false)
  assert.equal(canTransferProfileOwner(team, user, 1), false)
  assert.equal(canTransferProfileOwner(user, team, 1), false)
  assert.equal(canTransferProfileOwner(team, otherTeam, 0), true)
  assert.equal(canTransferProfileOwner(user, { type: `user`, id: 10 }, 1), true)
  assert.equal(canTransferProfileOwner(team, team, 1), true)
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
    new Set([20, 30, 40]),
    { type: 'user', id: 5 },
    7
  )

  assert.deepEqual(assignments, [
    current[1],
    current[2],
    { id: 0, owner: { type: 'user', id: 5 }, profileId: 7, gameServerId: 40, gameServerName: 'New eligible' }
  ])
})

test(`saved unavailable servers are removable options and cannot be added again after removal`, () => {
  const owner = { type: `user` as const, id: 7 }
  const servers = [{ ...gameServer(1, `Eligible`), ownerTeamId: 8 }, gameServer(2, `Released`)]
  const saved = [
    { id: 2, owner, profileId: 7, gameServerId: 2, gameServerName: `Released` },
    { id: 3, owner, profileId: 7, gameServerId: 3, gameServerName: `Hidden` }
  ]
  const options = buildProfileServerOptions(servers, [], 7, owner, [8], saved)
  assert.deepEqual(options.map(option => [option.value, Boolean(option.disabled)]), [[`1`, false], [`2`, false], [`3`, false]])
  const remaining = reconcileProfileServerAssignments(saved, eligibleProfileServers(servers, owner, [8]), new Set([1, 3]), owner, 7)
  assert.deepEqual(remaining.map(server => server.gameServerId), [3, 1])
  assert.equal(buildProfileServerOptions(servers, [], 7, owner, [8], remaining).some(option => option.value === `2`), false)
  assert.deepEqual(reconcileProfileServerAssignments(remaining, [], new Set(), owner, 7), [])
})

function gameServer(id: number, name: string): GameServerRecord {
  return {
    id,
    ownerTeamId: null,
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
