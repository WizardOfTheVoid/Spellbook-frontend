import { get } from 'svelte/store'
import { getCoreApi, type PlayerAction } from '$lib/core'
import { authState } from '$lib/auth/user'
import { gameProcessAvailable } from '$lib/stores/gameProcessAvailabilityStore'
import { consoleSetup } from '$lib/consoleSetup/consoleSetupStore'
import { actionsApi } from '$lib/utils/actionsApi'
import { executeProfileAction } from '$lib/utils/profileCommandRunner'
import { fetchActiveServerProfile, fetchPlayerProfile } from '$lib/utils/serverProfilesApi'
import { activeProfileGraphs } from '$lib/utils/activeProfiles'
import { profileExecutionGuard } from '$lib/utils/profileExecutionGuard'
import { unbanPlayer } from '$lib/utils/unbanPlayer'
import { actionLabel, actionServer } from '$lib/utils/playerActions'
import { formatOffenseType } from '$lib/utils/formatOffenseType'
import { notifyError, notifySuccess } from '$lib/notifications/notificationEvents'
import type { InfinityMenuItem } from '$lib/components/ui/infinityMenu'
import { openOffenseRemoval } from './offenseRemovalState'
import { actionTypeOrder, actionTypeIconColor } from '$lib/utils/profileActions'
import { canExecuteForPlayer } from './offenseDispatch'

export type OffenseTarget = { playerId: number, playfabId: string, name: string, gameServerId?: number, profile?: { profileId: number, actionKey: string }, onComplete?: () => void | Promise<void> }
export type OffenseOptions = { actions: PlayerAction[], activeBans: PlayerAction[] }

export function loadOffenses(playerId: number): Promise<OffenseOptions> {
  return actionsApi(`offenses`, { id: playerId })
}

export async function performOffenseAction(target: OffenseTarget, action: PlayerAction, unban: boolean, removeOffense = true) {
  const userId = get(authState).user?.id
  if (!userId) throw new Error(`Sign in before changing offenses.`)
  if (!unban) {
    await actionsApi(`removeOffense`, { id: target.playerId, actionId: action.id })
    notifySuccess(`Offense removed.`)
  } else {
    if (!action.gameServerId) throw new Error(`This ban has no game server.`)
    const snapshot = await getCoreApi().currentGameSnapshot().catch(() => null)
    if (get(authState).user?.id !== userId) throw new Error(`Your session changed. Reopen the action.`)
    if (get(gameProcessAvailable) && canExecuteForPlayer(snapshot, target.playfabId, action.gameServerId)) {
      if (get(consoleSetup).commandsBlocked) throw new Error(get(consoleSetup).commandIssue ?? `Check your console setup.`)
      const result = target.profile ? await executeUnbanProfile(target, action, removeOffense, snapshot!, userId) : await unbanPlayer({ playerId: target.playerId, playfabId: target.playfabId, playerName: target.name,
        gameServerId: action.gameServerId, ...(removeOffense ? { actionId: action.id, removeOffense: true } : {}) })
      if (!result.ok) throw new Error(result.message)
      notifySuccess(removeOffense ? `Player unbanned and offense removed.` : result.message)
    } else {
      await actionsApi(`unbanRequest`, { requestKey: crypto.randomUUID(), gameServerId: action.gameServerId,
        playerId: target.playerId, ...(target.profile ? { profile: target.profile } : {}), ...(removeOffense ? { actionId: action.id, removeOffense: true } : {}) })
      notifySuccess(`Unban requested.`)
    }
  }
  await target.onComplete?.()
}

export async function runOffenseAction(target: OffenseTarget, action: PlayerAction, unban: boolean, removeOffense = true) {
  try { await performOffenseAction(target, action, unban, removeOffense) }
  catch (error) { notifyError(error instanceof Error ? error.message : `Offense action failed.`) }
}

export async function requestStandaloneUnban(target: OffenseTarget, gameServerId: number) {
  try {
    const userId = get(authState).user?.id
    if (!userId) throw new Error(`Sign in before changing offenses.`)
    await actionsApi(`unbanRequest`, { requestKey: crypto.randomUUID(), gameServerId, playerId: target.playerId,
      ...(target.profile ? { profile: target.profile } : {}) })
    notifySuccess(`Unban requested.`)
    await target.onComplete?.()
  } catch (error) { notifyError(error instanceof Error ? error.message : `Offense action failed.`) }
}

export async function loadOffenseMenu(target: OffenseTarget, options?: OffenseOptions, includeStandalone = true): Promise<InfinityMenuItem[]> {
  const data = options ?? await loadOffenses(target.playerId)
  const actions = data.actions.filter(action => !target.gameServerId || action.gameServerId === target.gameServerId)
  const bans = data.activeBans.filter(action => !target.gameServerId || action.gameServerId === target.gameServerId)
  const removeOffense: InfinityMenuItem[] = actions.sort((left, right) => actionTypeOrder(left.actionType) - actionTypeOrder(right.actionType)).map(action => ({
    iconColor: actionTypeIconColor(action.actionType), icon: `fa-flag`, name: `${actionLabel(action)} · ${actionServer(action)} · #${action.id}`,
    children: [{ name: `Remove offense`, icon: `fa-trash`, action: () => runOffenseAction(target, action, false) }],
  }))
  const unban: InfinityMenuItem[] = bans.map(ban => ({
    name: unbanOffenseLabel(ban, bans, Boolean(target.gameServerId)),
    icon: `fa-ban`, iconColor: actionTypeIconColor(`ban`),
    children: [{ name: `Unban and remove offense`, icon: `fa-unlock`, action: () => runOffenseAction(target, ban, true) }],
  }))
  if (includeStandalone && (target.gameServerId || bans.length)) unban.push({ name: `Unban without offense`, icon: `fa-unlock`, action: async () => {
    const snapshot = await getCoreApi().currentGameSnapshot().catch(() => null)
    const localBan = get(gameProcessAvailable) ? bans.find(ban => canExecuteForPlayer(snapshot, target.playfabId, ban.gameServerId ?? undefined)) : null
    if (target.gameServerId && localBan) await runOffenseAction(target, localBan, true, false)
    else if (target.gameServerId) await requestStandaloneUnban(target, target.gameServerId)
    else if (localBan) await runOffenseAction(target, localBan, true, false)
    else openOffenseRemoval(target, undefined, true)
  } })
  return [
    ...(unban.length ? [{ name: `Unban`, icon: `fa-unlock`, children: unban }] : []),
    ...(removeOffense.length ? [{ name: `Remove offense`, icon: `fa-trash`, children: removeOffense }] : []),
  ]
}

function unbanOffenseLabel(ban: PlayerAction, bans: PlayerAction[], serverSelected: boolean): string {
  const offense = ban.offenseType ? formatOffenseType(ban.offenseType) : `Ban`
  const server = serverSelected ? `` : ` · ${actionServer(ban)}`
  const repeated = bans.some(other => other.id !== ban.id && other.offenseType === ban.offenseType && other.gameServerId === ban.gameServerId)
  return `${offense}${server}${repeated ? ` · #${ban.id}` : ``}`
}

async function executeUnbanProfile(target: OffenseTarget, ban: PlayerAction, removeOffense: boolean,
  snapshot: NonNullable<Awaited<ReturnType<ReturnType<typeof getCoreApi>[`currentGameSnapshot`]>>>, userId: number) {
  const active = await fetchActiveServerProfile(snapshot.externalId!)
  const action = activeProfileGraphs(active).find(graph => graph.profile.id === target.profile!.profileId)?.actions
    .find(action => action.actionKey === target.profile!.actionKey && action.isEnabled)
  const admin = get(authState).user
  if (!action || !action.commands.some(command => command.commandType === `unban`) || !admin || admin.id !== userId || active.gameServer?.id !== ban.gameServerId) throw new Error(`Selected action is no longer available.`)
  return executeProfileAction(action, { admin, playerId: target.playerId,
    player: { index: 0, name: target.name, playfabId: target.playfabId, rawLine: `` },
    ...(removeOffense ? { relatedActionId: ban.id, removeOffense: true } : {}),
    gameServer: active.gameServer, serverName: snapshot.serverName ?? ``, variables: active.variables,
    dbProfile: await fetchPlayerProfile(target.playfabId), beforeExecute: profileExecutionGuard(userId, snapshot.externalId, true, action.id) })
}
