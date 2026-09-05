import { get } from 'svelte/store'
import { authState } from '$lib/auth/user'
import { gameProcessAvailable } from '$lib/stores/gameProcessAvailabilityStore'
import { fetchServerPlayers } from './serverPlayersApi'
import { GAME_PROCESS_REQUIRED_TOOLTIP } from './gameProcessActions'

export function profileExecutionGuard(userId: number, externalId: string | null | undefined, requiresGame = true) {
  return async () => {
    const current = await fetchServerPlayers()
    if (get(authState).user?.id !== userId) throw new Error(`Your session changed. Reopen the actions.`)
    if (requiresGame && !get(gameProcessAvailable)) throw new Error(GAME_PROCESS_REQUIRED_TOOLTIP)
    if (!externalId || current.externalId !== externalId) throw new Error(`The current server changed. Reopen the actions.`)
  }
}
