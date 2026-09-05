import { get } from 'svelte/store'
import type { ActiveServerProfile, ServerProfileAction, ServerProfileCommandType } from '$lib/core'
import { authState } from '$lib/auth/user'
import { gameProcessAvailable } from '$lib/stores/gameProcessAvailabilityStore'
import { notifyError, notifySuccess, notifyWarning } from '$lib/notifications/notificationEvents'
import type { InfinityMenuItem } from '$lib/components/ui/infinityMenu'
import { activeProfileGraphs } from './activeProfiles'
import { actionCommandSummary, profileActionIcon } from './profileActions'
import { executeProfileAction } from './profileCommandRunner'
import { fetchActiveServerProfile, fetchPlayerProfile } from './serverProfilesApi'
import { fetchServerPlayers } from './serverPlayersApi'
import { GAME_PROCESS_REQUIRED_TOOLTIP } from './gameProcessActions'
import { profileExecutionGuard } from './profileExecutionGuard'

type Target = { playerId: number, playfabId: string, name: string }
type Options = {
  commandType?: ServerProfileCommandType
  excludeUnban?: boolean
  relatedActionId?: number
  onComplete?: () => void | Promise<void>
}

export function createProfileActionMenuItems(
  active: ActiveServerProfile,
  run: (action: ServerProfileAction) => Promise<void>,
  options: Options = {},
): InfinityMenuItem[] {
  return activeProfileGraphs(active).flatMap(graph => graph.actions
    .filter(action => action.isEnabled && action.actionDomain === `player`
      && (!options.commandType || action.commands.some(command => command.commandType === options.commandType))
      && (!options.excludeUnban || !action.commands.some(command => command.commandType === `unban`)))
    .map(action => ({
      name: action.label,
      icon: profileActionIcon(action).name,
      iconType: profileActionIcon(action).type,
      ...(graph.profile.owner.type === `user` ? { suffixIcon: `fa-user` } : {}),
      tooltip: `${graph.profile.name}: ${actionCommandSummary(action)}`,
      action: () => run(action),
    })))
}

export async function loadProfileActionMenu(target: Target, options: Options = {}): Promise<InfinityMenuItem[]> {
  const userId = get(authState).user?.id
  const current = await fetchServerPlayers()
  if (!current.externalId) throw new Error(`Join a game server to use profile actions.`)
  const active = await fetchActiveServerProfile(current.externalId)
  return createProfileActionMenuItems(active, async action => {
    try {
      const user = get(authState).user
      if (!user || user.id !== userId) throw new Error(`Your session changed. Reopen the menu.`)
      if (!get(gameProcessAvailable)) throw new Error(GAME_PROCESS_REQUIRED_TOOLTIP)
      const latest = await fetchServerPlayers()
      if (latest.externalId !== current.externalId) throw new Error(`The current server changed. Reopen the menu.`)
      const dbProfile = await fetchPlayerProfile(target.playfabId)
      const result = await executeProfileAction(action, {
        player: { index: 0, name: target.name, playfabId: target.playfabId, rawLine: `` },
        playerId: target.playerId,
        relatedActionId: options.relatedActionId,
        admin: user,
        serverName: latest.serverName ?? `Current game server`,
        gameServer: active.gameServer,
        dbProfile,
        variables: active.variables,
        beforeExecute: profileExecutionGuard(user.id, current.externalId),
      })
      if (result.ok) notifySuccess(result.message)
      else if (result.auditFailed) notifyWarning(result.message)
      else notifyError(result.message)
      if (result.sentCommands > 0) await options.onComplete?.()
    } catch (error) {
      notifyError(error instanceof Error ? error.message : `Profile action failed.`)
    }
  }, options)
}
