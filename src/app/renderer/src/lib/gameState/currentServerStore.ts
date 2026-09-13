import { derived } from 'svelte/store'
import { getCoreApi, type DbPlayerListItem } from '$lib/core'
import { getPlayers } from '$lib/utils/playersApi'
import { fetchActiveServerProfile } from '$lib/utils/serverProfilesApi'
import { getServerDisplayName, getServerLabel } from '$lib/utils/displayNames'
import type { ServerSummary } from '$lib/types/ui'
import { isGameRunning, isInGameServer, isMainMenu } from '../../../../shared/gameState'
import { gameState } from './gameStateStore'
import { createCurrentServerStore } from './currentServerState'

export const currentServer = createCurrentServerStore({ api: getCoreApi, loadProfile: fetchActiveServerProfile,
  loadPlayers: async include => {
    const players: DbPlayerListItem[] = []
    let totalPages = 1
    for (let page = 1; page <= totalPages; page++) {
      const result = await getPlayers({ include, page })
      players.push(...result.players)
      totalPages = result.meta.totalPages
    }
    return players
  }
})

export const currentServerSummary = derived([currentServer, gameState], ([current, game]): ServerSummary => {
  const snapshot = current.snapshot
  const connected = isInGameServer(game) && snapshot !== null
  const rawName = snapshot?.serverName?.trim() || `Current game server`
  const serverDisplayName = !game.available ? `Game status unavailable`
    : !isGameRunning(game) ? `Game not running`
    : isMainMenu(game) ? `Main Menu`
    : !connected ? `No current server`
    : current.activeProfile?.gameServer ? getServerLabel(current.activeProfile.gameServer)
    : getServerDisplayName(rawName)
  return { serverExternalId: connected ? snapshot.externalId : null,
    serverName: connected ? rawName : serverDisplayName,
    serverAddress: connected ? snapshot.serverAddress : null,
    serverDisplayName, playerState: current.playerState }
})
