import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  ActiveServerProfile,
  CoreCallResult,
  CurrentGameSnapshot,
  DbPlayerListItem,
  PlayerDbProfile,
  PlayerEntry
} from '$lib/core'
import { mergePlayerState } from './playerStateData'
import type { CurrentServerState } from '$lib/gameState/currentServerState'
import {
  loadPlayerProfileActionContext,
  loadPlayerProfileSnapshot,
  mergePlayerProfileLiveState
} from './playerProfileLoader'

test(`profile game stats follow the shared roster and clear on departure while remote presence remains independent`, () => {
  const current = mergePlayerState(livePlayer(`Old`), dbPlayer())
  const updated = mergePlayerState({ ...livePlayer(`Renamed`), score: 20, kills: 3 }, dbPlayer())
  const merged = mergePlayerProfileLiveState(current, [updated], false)
  assert.equal(merged.name, `Renamed`)
  assert.equal(merged.score, 20)
  assert.equal(merged.kills, 3)
  assert.equal(merged.isLive, true)
  assert.equal(merged.isOnline, true)
  const departed = mergePlayerProfileLiveState(merged, [], true)
  assert.equal(departed.isLive, false)
  assert.equal(departed.livePlayer, null)
  assert.equal(departed.score, null)
  assert.equal(departed.isOnline, true)
  const withoutDb = mergePlayerProfileLiveState({ ...merged, dbPlayer: null }, [], false)
  assert.equal(withoutDb.isLive, false)
  assert.equal(withoutDb.score, null)
  assert.equal(withoutDb.isOnline, false)
})

test(`profile refresh clears departed server context and only fetches DB detail`, async () => {
  const calls: string[] = []
  installBridge(null, calls)
  const current = mergePlayerState(livePlayer(`  Exact  Player  `), dbPlayer())

  const loaded = await loadPlayerProfileSnapshot(current, {
    serverExternalId: `last-resolved-id`,
    serverName: `Last server`,
    serverAddress: `127.0.0.1:7777`
  }, false, cachedLocal(null))
  const refreshed = await loadPlayerProfileSnapshot(loaded.player!, {
    serverExternalId: loaded.serverExternalId,
    serverName: loaded.serverName,
    serverAddress: loaded.serverAddress
  }, false, cachedLocal(null))

  assert.equal(refreshed.serverExternalId, null)
  assert.equal(refreshed.serverName, null)
  assert.equal(refreshed.serverAddress, null)
  assert.equal(refreshed.player?.isLive, false)
  assert.deepEqual(calls, [
    `dbProfile`,
    `dbProfile`
  ])
})

test('exact snapshot external ID reaches player profile actions', async () => {
  const calls: string[] = []
  installBridge(gameSnapshot(`server-resolved-id`, `  Exact  Player  `), calls)
  const current = mergePlayerState(livePlayer(`Old`), dbPlayer())

  const loaded = await loadPlayerProfileSnapshot(current, {
    serverExternalId: `old-id`,
    serverName: `Old server`,
    serverAddress: null
  }, false, cachedLocal(gameSnapshot(`server-resolved-id`, `  Exact  Player  `)))
  await loadPlayerProfileActionContext(loaded.serverExternalId)

  assert.equal(loaded.player?.name, `  Exact  Player  `)
  assert.deepEqual(calls, [
    `dbProfile`,
    `activeProfile:server-resolved-id`
  ])
})

test(`remote presence is retained in the profile without replacing the local action target`, async () => {
  const profile = dbProfile()
  profile.presence = {
    isOnline: true, observedAt: `2026-09-06T12:00:00.000Z`,
    server: { id: 99, name: `Remote server`, durationSeconds: 123, durationObservedAt: `2026-09-06T12:00:00.000Z` }
  }
  installBridge(gameSnapshot(`local-server`, `Player`), [], profile)
  const loaded = await loadPlayerProfileSnapshot(mergePlayerState(null, dbPlayer()), undefined, false, cachedLocal(gameSnapshot(`local-server`, `Player`)))
  assert.equal(loaded.dbProfile?.player.id, 1)
  assert.deepEqual(loaded.dbProfile?.presence, profile.presence)
  assert.equal(loaded.serverExternalId, `local-server`)
  assert.equal(loaded.serverName, `Current server`)
})

function installBridge(snapshot: CurrentGameSnapshot | null, calls: string[], profile = dbProfile()): void {
  Object.defineProperty(globalThis, `window`, {
    configurable: true,
    value: {
      chivCore: {
        currentGameSnapshot: async () => {
          calls.push(`currentGameSnapshot`)
          return snapshot
        },
        listPlayers: async () => { throw new Error(`renderer ListPlayers is forbidden`) },
        refreshCurrentGameSnapshot: async () => { throw new Error(`renderer refresh is forbidden`) }
      },
      chivServer: {
        visitPlayerProfileByPlayfab: async () => {
          calls.push(`visitProfile`)
          return success(profile)
        },
        playerProfileByPlayfab: async () => {
          calls.push(`dbProfile`)
          return success(profile)
        },
        serverProfiles: {
          active: async (externalId: string | null) => {
            calls.push(`activeProfile:${externalId}`)
            return success({} as ActiveServerProfile)
          }
        }
      }
    }
  })
}

function gameSnapshot(externalId: string, name: string): CurrentGameSnapshot {
  return {
    version: 3,
    observedAt: `2026-08-31T10:00:00.000Z`,
    gameServerId: 7,
    externalId,
    serverName: `Current server`,
    serverAddress: `127.0.0.1:7777`,
    players: [livePlayer(name)],
    parseWarnings: []
  }
}

function cachedLocal(snapshot: CurrentGameSnapshot | null): () => CurrentServerState {
  return () => ({ snapshot, players: snapshot?.players.map(player => mergePlayerState(player, dbPlayer())) ?? [],
    roster: null, activeProfile: null, playerState: `ok`, error: null, revision: 1 })
}

function livePlayer(name: string): PlayerEntry {
  return { index: 1, name, playfabId: `PF-1`, rawLine: name }
}

function dbPlayer(): DbPlayerListItem {
  return {
    id: 1,
    playfabId: `PF-1`,
    latestName: `Stored player`,
    latestNormalizedName: `stored player`,
    lastLogin: null,
    playtimeHours: null,
    activeBanKind: null,
    isOnline: true
  }
}

function dbProfile(): PlayerDbProfile {
  return {
    player: {
      ...dbPlayer(),
      playfab: {
        account: null,
        statistics: null,
        freshness: { stale: false, refreshFailed: false }
      }
    },
    names: [],
    meta: [],
    actions: [],
    noteCount: 0
  }
}

function success(data: unknown): CoreCallResult {
  return {
    ok: true,
    status: 200,
    statusText: `OK`,
    data: { ok: true, data }
  }
}


test(`opening a profile records a visit while subsequent snapshots only read`, async () => {
  const calls: string[] = []
  const profile = dbProfile()
  profile.player.profileVisitCount = 12
  installBridge(null, calls, profile)
  const current = mergePlayerState(null, dbPlayer())
  const opened = await loadPlayerProfileSnapshot(current, undefined, true, cachedLocal(null))
  await loadPlayerProfileSnapshot(current, undefined, false, cachedLocal(null))
  assert.equal(opened.dbProfile?.player.profileVisitCount, 12)
  assert.deepEqual(calls, [`visitProfile`, `dbProfile`])
})
