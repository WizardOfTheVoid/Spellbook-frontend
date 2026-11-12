import { derived } from 'svelte/store'
import { getCoreApi } from '$lib/core'
import { serverStore } from '$lib/serverStore/serverStore'
import { enrichPlayers } from '$lib/utils/playersApi'
import { fetchActiveServerProfile } from '$lib/utils/serverProfilesApi'
import { getServerDisplayName, getServerLabel } from '$lib/utils/displayNames'
import type { ServerSummary } from '$lib/types/ui'
import { isGameRunning, isInGameServer, isMainMenu } from '../../../../shared/gameState'
import { gameState } from './gameStateStore'
import { createCurrentServerStore } from './currentServerState'

export const currentServer = createCurrentServerStore({ api: getCoreApi, loadProfile: fetchActiveServerProfile,
  enrichPlayers,
  loadRoster: (id, force) => serverStore.roster(id, force), syncCache: scope => serverStore.sync(scope),
  invalidateRoster: id => serverStore.invalidate(id), subscribeRoster: listener => serverStore.subscribe(listener)
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
