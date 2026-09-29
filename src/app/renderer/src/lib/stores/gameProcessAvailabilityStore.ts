import { derived } from 'svelte/store'
import { gameState } from '$lib/gameState/gameStateStore'
import { isGameRunning, isGameFocused } from '../../../../shared/gameState'

export const gameProcessAvailable = {
  subscribe: derived(gameState, isGameRunning).subscribe,
  focused: derived(gameState, isGameFocused),
  sync: gameState.sync,
  refresh: gameState.refresh,
  destroy: gameState.destroy
}

export const syncGameProcessAvailability = gameState.sync
export const stopGameProcessAvailability = gameState.destroy
