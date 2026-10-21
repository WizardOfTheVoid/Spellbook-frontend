import { derived } from 'svelte/store'
import { currentServer } from '$lib/gameState/currentServerStore'
import { gameState } from '$lib/gameState/gameStateStore'
import { isInGameServer } from '../../../../shared/gameState'

/**
 * Last unfiltered player list enriched by the backend.
 * The snapshot lookup runs while the overlay is hidden, so it can only match this cached list.
 */
export const serverPlayers = derived([currentServer, gameState], ([server, game]) => isInGameServer(game) ? server.players : [])
