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
import {
  loadPlayerProfileActionContext,
  loadPlayerProfileSnapshot
} from './playerProfileLoader'

test('detail refresh keeps last server context and never reaches renderer ListPlayers input', async () => {
  const calls: string[] = []
  installBridge(null, calls)
  const current = mergePlayerState(livePlayer(`  Exact  Player  `), dbPlayer())

  const loaded = await loadPlayerProfileSnapshot(current, {
    serverExternalId: `last-resolved-id`,
    serverName: `Last server`,
    serverAddress: `127.0.0.1:7777`
  })
  const refreshed = await loadPlayerProfileSnapshot(loaded.player!, {
    serverExternalId: loaded.serverExternalId,
    serverName: loaded.serverName,
    serverAddress: loaded.serverAddress
  })

  assert.equal(refreshed.serverExternalId, `last-resolved-id`)
  assert.equal(refreshed.serverName, `Last server`)
  assert.equal(refreshed.serverAddress, `127.0.0.1:7777`)
  assert.equal(refreshed.player?.name, `  Exact  Player  `)
  assert.deepEqual(calls, [
    `currentGameSnapshot`,
    `dbProfile`,
    `currentGameSnapshot`,
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
  })
  await loadPlayerProfileActionContext(loaded.serverExternalId)

  assert.equal(loaded.player?.name, `  Exact  Player  `)
  assert.deepEqual(calls, [
    `currentGameSnapshot`,
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
  const loaded = await loadPlayerProfileSnapshot(mergePlayerState(null, dbPlayer()))
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
