import { get } from 'svelte/store'
import { authState } from '$lib/auth/user'
import { gameProcessAvailable } from '$lib/stores/gameProcessAvailabilityStore'
import { consoleSetup } from '$lib/consoleSetup/consoleSetupStore'
import { fetchServerPlayers } from './serverPlayersApi'
import { fetchActiveServerProfile } from './serverProfilesApi'
import { activeProfileGraphs } from './activeProfiles'
import { gameCommandIssue } from './gameProcessActions'

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
  const issue = gameCommandIssue(!requiresGame || get(gameProcessAvailable), get(consoleSetup).commandsBlocked, get(consoleSetup).commandIssue)
  if (issue) throw new Error(issue)
  if (!externalId || current.externalId !== externalId) throw new Error(`The current server changed. Reopen the actions.`)
}
