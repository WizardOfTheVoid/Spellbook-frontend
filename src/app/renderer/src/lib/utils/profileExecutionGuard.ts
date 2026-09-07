import { get } from 'svelte/store'
import { authState } from '$lib/auth/user'
import { gameProcessAvailable } from '$lib/stores/gameProcessAvailabilityStore'
import { fetchServerPlayers } from './serverPlayersApi'
import { fetchActiveServerProfile } from './serverProfilesApi'
import { activeProfileGraphs } from './activeProfiles'
import { GAME_PROCESS_REQUIRED_TOOLTIP } from './gameProcessActions'

const unavailableActionMessage = `This profile action is no longer available. Reopen the actions.`

export function profileExecutionGuard(
  userId: number,
  externalId: string | null | undefined,
  requiresGame = true,
  actionId?: number
) {
  return async () => {
    checkContext(userId, externalId, requiresGame, await fetchServerPlayers())
    if (actionId === undefined) return

    let active
    try {
      active = await fetchActiveServerProfile(externalId)
    } catch {
      checkContext(userId, externalId, requiresGame, await fetchServerPlayers())
      throw new Error(unavailableActionMessage)
    }

    checkContext(userId, externalId, requiresGame, await fetchServerPlayers())
    const available = activeProfileGraphs(active).some(graph =>
      graph.actions.some(action => action.id === actionId && action.isEnabled)
    )
    if (!available) throw new Error(unavailableActionMessage)
  }
}

function checkContext(
  userId: number,
  externalId: string | null | undefined,
  requiresGame: boolean,
  current: Awaited<ReturnType<typeof fetchServerPlayers>>
): void {
  if (get(authState).user?.id !== userId) throw new Error(`Your session changed. Reopen the actions.`)
  if (requiresGame && !get(gameProcessAvailable)) throw new Error(GAME_PROCESS_REQUIRED_TOOLTIP)
  if (!externalId || current.externalId !== externalId) throw new Error(`The current server changed. Reopen the actions.`)
}
