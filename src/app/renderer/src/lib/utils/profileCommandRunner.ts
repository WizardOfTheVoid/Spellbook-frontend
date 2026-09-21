import { isMessageCommand } from '@spellbook/shared/actions/actionMessage.js'
import { getAdminName } from "@spellbook/shared/adminName.js"
import { submittedCommands } from '@spellbook/shared/actions/submittedCommands'
import {
  extractEnvelope,
  getCoreApi,
  getCoreErrorMessage,
  type ActiveServerProfile,
  type ChivCoreApi,
  type CoreCallResult,
  type PlayerDbProfile,
  type PlayerEntry,
  type ServerProfileAction,
  type ServerProfileCommand
} from "$lib/core"
import { recordActionByPlayfab } from "./serverProfilesApi"
import {
  resolveMessageTemplate,
  type MessageVariable
} from "./messageTags"
import { profileUnbanApi, type ProfileUnbanApi } from "./profileUnban"
import { checkPlayerBans } from './playerBanCheck'
import { playerBanCommand, repeatedBanCommandIssue } from '@spellbook/shared/playerBans'
import type { ActionCommand } from '@spellbook/shared/actions/actionTypes'

const pendingBans = new Set<string>()

type ProfileCoreApi = Pick<ChivCoreApi, "executeProfileRecipe">

type ActiveGameServer = NonNullable<ActiveServerProfile["gameServer"]>

type ResolvedCommand = {
  command: ServerProfileCommand
  message: string
}

export type ProfileActionExecutionContext = {
  player?: PlayerEntry | null
  admin: { username: string; displayName?: string }
  /** Raw Core-reported name retained for the current server context. */
  serverName: string
  gameServer?: ActiveGameServer | null
  dbProfile?: PlayerDbProfile | null
  variables?: MessageVariable[]
  playerId?: number
  relatedActionId?: number
  removeOffense?: boolean
  beforeExecute?: () => Promise<void>
}

export type ProfileActionExecutionResult = {
  ok: boolean
  message: string
  sentCommands: number
  auditFailed?: boolean
}

export async function executeProfileAction(...args: Parameters<typeof executeCheckedProfileAction>): Promise<ProfileActionExecutionResult> {
  const [action, context] = args
  const repeated = repeatedBanCommandIssue(action.commands)
  if (repeated) return { ok: false, message: repeated, sentCommands: 0 }
  const playerKey = JSON.stringify([context.gameServer?.id, context.player?.playfabId]).slice(0, -1) + `,`
  const incrementalKey = `${playerKey}"incremental_ban"]`
  const keys = action.commands.filter(command => command.commandType === `ban` || command.commandType === `incremental_ban`).map(command => {
    if (command.commandType === `incremental_ban`) return incrementalKey
    const ban = playerBanCommand(command)
    return JSON.stringify([context.gameServer?.id, context.player?.playfabId, ban.offenseType, ban.duration])
  })
  // The duration is unknown until preflight completes, so protect the player's ban slot during resolution and submission.
  if (keys.length && (pendingBans.has(incrementalKey) || keys.includes(incrementalKey) && [...pendingBans].some(key => key.startsWith(playerKey)))) {
    return { ok: false, message: `A ban for this player is already being submitted.`, sentCommands: 0 }
  }
  if (keys.some(key => pendingBans.has(key))) return { ok: false, message: `An identical ban for this player is already being submitted.`, sentCommands: 0 }
  for (const key of keys) pendingBans.add(key)
  try { return await executeCheckedProfileAction(...args) }
  finally { for (const key of keys) pendingBans.delete(key) }
}

async function executeCheckedProfileAction(
  action: ServerProfileAction,
  context: ProfileActionExecutionContext,
  core: ProfileCoreApi = getCoreApi(),
  recordAction: typeof recordActionByPlayfab = recordActionByPlayfab,
  unbanApi: ProfileUnbanApi = profileUnbanApi,
  checkBans: (...args: Parameters<typeof checkPlayerBans>) => Promise<readonly ActionCommand[] | void> = checkPlayerBans,
): Promise<ProfileActionExecutionResult> {
  let commands: readonly ActionCommand[] = [...action.commands].sort(
    (left, right) => left.sortOrder - right.sortOrder
  )
  if (commands.some(command => command.commandType === `unban`)) {
    const playerId = context.playerId ?? context.dbProfile?.player.id
    if (!playerId || !context.gameServer) {
      return { ok: false, message: `Unban requires a resolved player and current server.`, sentCommands: 0 }
    }
    try {
      await unbanApi.validate(playerId, context.gameServer.id, context.relatedActionId)
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : `Unban is unavailable.`, sentCommands: 0 }
    }
  }
  if (action.actionDomain === `player` && !context.player?.playfabId) {
    return { ok: false, message: `Player commands require a selected player.`, sentCommands: 0 }
  }
  if (commands.some(command => command.commandType === `ban` || command.commandType === `incremental_ban`)) {
    if (!context.player?.playfabId || !context.gameServer) {
      return { ok: false, message: `Ban requires a resolved player and current server.`, sentCommands: 0 }
    }
    try {
      commands = await checkBans(context.player.playfabId, context.gameServer.id, commands) ?? commands
      if (commands.some(command => command.commandType === `incremental_ban`)) throw new Error(`Could not resolve incremental ban duration.`)
      const repeated = repeatedBanCommandIssue(commands)
      if (repeated) throw new Error(repeated)
    }
    catch (error) { return { ok: false, message: error instanceof Error ? error.message : `Ban status is unavailable.`, sentCommands: 0 } }
  }
  await context.beforeExecute?.()
  let execution: Awaited<ReturnType<ProfileCoreApi[`executeProfileRecipe`]>>
  try {
    execution = await core.executeProfileRecipe({
      recipe: { ...action, commands: [...commands] },
      target: action.actionDomain === `player` ? { type: `player`, playfabId: context.player?.playfabId ?? `` } : { type: `server` },
      gameServerId: context.gameServer?.id ?? 0,
      context: {
        admin: getAdminName(context.admin),
        player: context.player ?? undefined,
        serverName: context.gameServer?.displayName?.trim() || context.gameServer?.name || context.serverName,
        clanName: context.gameServer?.clanName ?? undefined,
        clanTag: context.gameServer?.clanTag ?? undefined,
        playerRank: context.dbProfile?.player.playfab.statistics?.rank ?? context.dbProfile?.player.rank ?? context.player?.rank,
        lastLogin: context.dbProfile?.player.playfab.statistics?.lastLoginAt ?? context.dbProfile?.player.lastLogin,
        playtimeHours: context.dbProfile?.player.playfab.statistics?.playtimeHours ?? context.dbProfile?.player.playtimeHours,
        offenses: context.dbProfile?.actions.filter(action => [`ban`, `kick`, `warn`].includes(action.actionType)).length ?? 0,
        variables: context.variables
      }
    })
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : `Action preparation failed.`, sentCommands: 0 }
  }
  const coreResult = execution.result
  const sentCommands =
    extractEnvelope<{ sentCommands: number }>(coreResult)?.data?.sentCommands ?? 0
  const auditFailure = await recordSubmittedActions(
    submittedCommands(execution.prepared?.spans ?? [], sentCommands) as ResolvedCommand[],
    { ...context, removeOffense: context.removeOffense && isOk(coreResult) && sentCommands === execution.prepared?.nativeCount },
    recordAction,
    unbanApi,
  )

  if (!isOk(coreResult)) {
    return {
      ok: false,
      message: getCoreErrorMessage(coreResult, `Profile command failed.`),
      sentCommands
    }
  }

  if (auditFailure) {
    return { ...auditFailure, sentCommands }
  }

  return {
    ok: true,
    message: `${action.label} complete.`,
    sentCommands
  }
}

export function resolveMessageTags(
  template: string,
  command: ServerProfileCommand,
  context: ProfileActionExecutionContext
): string {
  const duration =
    command.durationHours === 999999
      ? `MAX`
      : command.durationHours?.toString() ?? ``
  const offenseCount = context.dbProfile?.actions.filter(action => [`ban`, `kick`, `warn`].includes(action.actionType)).length ?? 0
  const serverTags = context.gameServer
    ? {
        serverName: context.gameServer.displayName?.trim() || context.gameServer.name,
        clanName: context.gameServer.clanName ?? ``,
        clanTag: context.gameServer.clanTag ?? ``
      }
    : {}

  return resolveMessageTemplate(template, {
    playerRank: context.dbProfile?.player.playfab.statistics?.rank ?? context.dbProfile?.player.rank ?? context.player?.rank,
    lastLogin: context.dbProfile?.player.playfab.statistics?.lastLoginAt ?? context.dbProfile?.player.lastLogin,
    playtimeHours: context.dbProfile?.player.playfab.statistics?.playtimeHours ?? context.dbProfile?.player.playtimeHours,
    user: context.player?.name,
    duration,
    admin: getAdminName(context.admin),
    playfab: context.player?.playfabId,
    offenses: offenseCount.toString(),
    variables: context.variables,
    ...serverTags
  })
}

async function recordSubmittedActions(
  commands: ResolvedCommand[],
  context: ProfileActionExecutionContext,
  recordAction: typeof recordActionByPlayfab,
  unbanApi: ProfileUnbanApi,
): Promise<Omit<ProfileActionExecutionResult, "sentCommands"> | null> {
  if (!context.player) return null
  const offenseCommands = commands.filter(({ command }) => !isMessageCommand(command.commandType))

  if (offenseCommands.length === 0) return null

  if (!context.gameServer) {
    return {
      ok: false,
      message: `Command sent, but audit record failed: Current server was not resolved.`,
      auditFailed: true
    }
  }

  let firstFailure: Omit<ProfileActionExecutionResult, "sentCommands"> | null = null

  for (const { command, message } of offenseCommands) {
    if (isMessageCommand(command.commandType)) continue

    try {
      if (command.commandType === `incremental_ban`) throw new Error(`Incremental ban was not resolved.`)
      if (command.commandType === `unban`) {
        await unbanApi.record({
          playfabId: context.player.playfabId,
          playerName: context.player.name,
          gameServerId: context.gameServer.id,
          reason: message,
        }, context.relatedActionId ? {
          playerId: (context.playerId ?? context.dbProfile?.player.id)!,
          actionId: context.relatedActionId,
          ...(context.removeOffense ? { removeOffense: true } : {}),
        } : undefined)
        continue
      }
      const hacker = command.commandType === `ban` && command.offenseType === `hacker`
      await recordAction({
        playfabId: context.player.playfabId,
        playerName: context.player.name,
        gameServerId: context.gameServer.id,
        actionType: command.commandType,
        offenseType: command.offenseType ?? `other`,
        duration: command.commandType === `ban` ? playerBanCommand(command).duration : command.durationHours ?? null,
        reason: message,
        scope: hacker ? `global` : `local`
      })
    } catch (error) {
      firstFailure ??= {
        ok: false,
        message:
          error instanceof Error
            ? `Command sent, but audit record failed: ${error.message}`
            : `Command sent, but audit record failed.`,
        auditFailed: true
      }
    }
  }

  return firstFailure
}

function isOk(result: CoreCallResult): boolean {
  return result.ok && extractEnvelope<unknown>(result)?.ok !== false
}
