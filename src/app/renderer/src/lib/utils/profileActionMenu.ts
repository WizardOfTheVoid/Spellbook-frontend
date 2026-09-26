import { get } from 'svelte/store'
import { profileDuplicateBan } from '@spellbook/shared/playerBans'
import type { PlayerAction } from '$lib/core'
import { getCoreApi } from '$lib/core'
import { actionsApi } from './actionsApi'
import { openOffenseRemoval } from '$lib/components/players/offenses/offenseRemovalState'
import { loadOffenses, loadOffenseMenu, requestStandaloneUnban } from '$lib/components/players/offenses/offenseActions'
import { canExecuteForPlayer } from '$lib/components/players/offenses/offenseDispatch'
import { consoleSetup } from '$lib/consoleSetup/consoleSetupStore'
import { consoleSetupIssue } from '../../../../shared/consoleSetup'
import type { ActiveServerProfile, ServerProfileAction, ServerProfileCommandType } from '$lib/core'
import { authState } from '$lib/auth/user'
import { gameProcessAvailable } from '$lib/stores/gameProcessAvailabilityStore'
import { notifyError, notifySuccess, notifyWarning } from '$lib/notifications/notificationEvents'
import type { InfinityMenuItem } from '$lib/components/ui/infinityMenu'
import { activeProfileGraphs } from './activeProfiles'
import { actionCommandSummary, profileActionIcon, profileActionIconColor, actionTypeIconColor, profileActionOrder } from './profileActions'
import { executeProfileAction } from './profileCommandRunner'
import { fetchActiveServerProfile, fetchPlayerProfile } from './serverProfilesApi'
import { fetchServerPlayers } from './serverPlayersApi'
import { GAME_PROCESS_REQUIRED_TOOLTIP } from './gameProcessActions'
import { profileExecutionGuard } from './profileExecutionGuard'

type Target = { playerId: number, playfabId: string, name: string, gameServerId?: number }
type Options = {
  activeBans?: readonly PlayerAction[]
  commandsBlocked?: boolean
  commandIssue?: string | null
  commandType?: ServerProfileCommandType
  excludeUnban?: boolean
  groupByType?: boolean
  relatedActionId?: number
  onComplete?: () => void | Promise<void>
}

const commandGroups: { type: ServerProfileCommandType, name: string, icon: string }[] = [
  { type: `ban`, name: `Ban`, icon: `fa-ban` },
  { type: `kick`, name: `Kick`, icon: `fa-person-walking-arrow-right` },
  { type: `unban`, name: `Unban`, icon: `fa-unlock` },
  { type: `warn`, name: `Warn`, icon: `fa-triangle-exclamation` },
  { type: `admin_message`, name: `Adminsay`, icon: `fa-bullhorn` },
  { type: `server_message`, name: `Server message`, icon: `fa-bullhorn` },
]

type ActionMenuEntry = { action: ServerProfileAction, item: InfinityMenuItem }

function actionGroupType(action: ServerProfileAction): ServerProfileCommandType | undefined {
  return commandGroups.find(group => action.commands.some(command => command.commandType === group.type
    || group.type === `ban` && command.commandType === `incremental_ban`))?.type
}

function groupActionMenuEntries(entries: ActionMenuEntry[], groupByType: boolean): InfinityMenuItem[] {
  const sorted = entries.sort((left, right) => profileActionOrder(left.action) - profileActionOrder(right.action))
  if (!groupByType) return sorted.map(entry => entry.item)
  return commandGroups.map(group => ({
    name: group.name,
    icon: group.icon,
    iconColor: actionTypeIconColor(group.type),
    children: sorted.filter(entry => actionGroupType(entry.action) === group.type).map(entry => entry.item),
  })).filter(group => group.children.length > 0)
}

function combineActionMenus(actions: InfinityMenuItem[], offenses: InfinityMenuItem[]): InfinityMenuItem[] {
  const offenseUnban = offenses.find(item => item.name === `Unban`)
  const configuredUnban = actions.find(item => item.name === `Unban`)
  const unban = offenseUnban || configuredUnban ? {
    ...(offenseUnban ?? configuredUnban!),
    children: [...(offenseUnban?.children ?? []), ...(configuredUnban?.children ?? [])],
  } : null
  const combined = [...actions.filter(item => item.name !== `Unban`),
    ...(unban ? [unban] : []),
    ...offenses.filter(item => item.name !== `Unban`)]
  const order = (item: InfinityMenuItem) => {
    const index = commandGroups.findIndex(group => group.name === item.name)
    return index < 0 ? commandGroups.length : index
  }
  return combined.sort((left, right) => order(left) - order(right))
}

export function createRequestActionMenuItems(actions: ServerProfileAction[], gameServerId: number, activeBans: readonly PlayerAction[],
  run: (action: ServerProfileAction) => Promise<void>): InfinityMenuItem[] {
  return groupActionMenuEntries(actions.filter(action => action.isEnabled && action.actionDomain === `player`
    && (!action.commands.some(command => command.commandType === `unban`) || activeBans.some(ban => ban.gameServerId === gameServerId)))
    .map(action => ({ action, item: {
      name: action.label, icon: profileActionIcon(action).name, iconType: profileActionIcon(action).type,
      iconColor: profileActionIconColor(action),
      disabled: Boolean(profileDuplicateBan(action.commands, activeBans, gameServerId)),
      tooltip: profileDuplicateBan(action.commands, activeBans, gameServerId) ?? undefined,
      action: () => run(action),
    } })), true)
}

export function createProfileActionMenuItems(
  active: ActiveServerProfile,
  run: (action: ServerProfileAction) => Promise<void>,
  options: Options = {},
): InfinityMenuItem[] {
  const entries = activeProfileGraphs(active).flatMap(graph => graph.actions
    .filter(action => action.isEnabled && action.actionDomain === `player`
      && (!options.commandType || action.commands.some(command => command.commandType === options.commandType))
      && (!options.excludeUnban || !action.commands.some(command => command.commandType === `unban`)))
    .map(action => ({
      action,
      item: {
        name: action.label,
        icon: profileActionIcon(action).name,
        iconType: profileActionIcon(action).type,
        iconColor: profileActionIconColor(action),
        ...(graph.profile.owner.type === `user` ? { suffixIcon: `fa-user` } : {}),
        disabled: options.commandsBlocked === true || Boolean(profileDuplicateBan(action.commands, options.activeBans ?? [], active.gameServer?.id)),
        tooltip: profileDuplicateBan(action.commands, options.activeBans ?? [], active.gameServer?.id)
          ?? (options.commandsBlocked ? options.commandIssue ?? consoleSetupIssue : `${graph.profile.name}: ${actionCommandSummary(action)}`),
        action: () => run(action),
      },
    })))
  return groupActionMenuEntries(entries, options.groupByType === true)
}

export async function loadProfileActionMenu(target: Target, options: Options = {}): Promise<InfinityMenuItem[]> {
  const userId = get(authState).user?.id
  const snapshot = await getCoreApi().currentGameSnapshot().catch(() => null)
  const offenseOptions = await loadOffenses(target.playerId)
  const { activeBans } = offenseOptions
  if (options.commandType === `unban`) return loadOffenseMenu({ ...target, onComplete: options.onComplete }, offenseOptions)
  if (!get(gameProcessAvailable) || !canExecuteForPlayer(snapshot, target.playfabId, target.gameServerId)) {
    const servers = await actionsApi<{ gameServerId: number, name: string, profileId: number, actions: ServerProfileAction[] }[]>(`options`)
    const selected = servers.filter(server => !target.gameServerId || server.gameServerId === target.gameServerId)
    const menus = selected.map(server => ({ name: server.name, icon: `fa-server`, children: [
      ...createRequestActionMenuItems(server.actions, server.gameServerId, activeBans, async action => {
        try {
          if (get(authState).user?.id !== userId) throw new Error(`Your session changed. Reopen the menu.`)
          if (action.commands.some(command => command.commandType === `unban`)) {
            openOffenseRemoval({ ...target, gameServerId: server.gameServerId, profile: { profileId: server.profileId, actionKey: action.actionKey! }, onComplete: options.onComplete })
            return
          }
          await actionsApi(`request`, { requestKey: crypto.randomUUID(), gameServerId: server.gameServerId, profileId: server.profileId,
            actionKey: action.actionKey, target: { type: `player`, playfabId: target.playfabId } })
          notifySuccess(`Action requested.`)
        } catch (error) { notifyError(error instanceof Error ? error.message : `Action request failed.`) }
      }),
      { name: `Unban without offense`, icon: `fa-unlock`,
        action: () => requestStandaloneUnban({ ...target, onComplete: options.onComplete }, server.gameServerId) },
    ] }))
    const offenses = await loadOffenseMenu({ ...target, onComplete: options.onComplete }, offenseOptions, false)
    return [...(target.gameServerId && menus.length === 1 ? menus[0]!.children : menus), ...offenses]
  }
  const current = await fetchServerPlayers()
  if (!current.externalId) throw new Error(`The current server changed. Reopen the menu.`)
  const active = await fetchActiveServerProfile(current.externalId)
  const items = createProfileActionMenuItems(active, async action => {
    try {
      const user = get(authState).user
      if (!user || user.id !== userId) throw new Error(`Your session changed. Reopen the menu.`)
      if (action.commands.some(command => command.commandType === `unban`)) {
        const graph = activeProfileGraphs(active).find(graph => graph.actions.some(candidate => candidate.id === action.id))
        if (graph && action.actionKey && active.gameServer) openOffenseRemoval({ ...target, gameServerId: active.gameServer.id,
          profile: { profileId: graph.profile.id, actionKey: action.actionKey }, onComplete: options.onComplete })
        return
      }
      if (!get(gameProcessAvailable)) throw new Error(GAME_PROCESS_REQUIRED_TOOLTIP)
      const latest = await fetchServerPlayers()
      if (latest.externalId !== current.externalId || !latest.players.some(player => player.playfabId === target.playfabId)) throw new Error(`The current server changed. Reopen the menu.`)
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
        beforeExecute: profileExecutionGuard(user.id, current.externalId, true, action.id),
      })
      if (result.ok) notifySuccess(result.message)
      else if (result.auditFailed) notifyWarning(result.message)
      else notifyError(result.message)
      if (result.sentCommands > 0) await options.onComplete?.()
    } catch (error) {
      notifyError(error instanceof Error ? error.message : `Profile action failed.`)
    }
  }, { ...options, activeBans, excludeUnban: !activeBans.some(ban => ban.gameServerId === active.gameServer?.id), commandsBlocked: get(consoleSetup).commandsBlocked, commandIssue: get(consoleSetup).commandIssue })
  const offenses = await loadOffenseMenu({ ...target, gameServerId: active.gameServer?.id ?? target.gameServerId, onComplete: options.onComplete }, offenseOptions)
  return combineActionMenus(items, offenses)
}
