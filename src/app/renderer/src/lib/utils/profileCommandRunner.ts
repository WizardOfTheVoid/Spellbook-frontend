import {
  extractEnvelope,
  getCoreApi,
  getCoreErrorMessage,
  type ActiveServerProfile,
  type ChivCoreApi,
  type CoreBatchCommand,
  type CoreCallResult,
  type PlayerDbProfile,
  type PlayerEntry,
  type ServerProfileAction,
  type ServerProfileCommand
} from "$lib/core"
import { recordActionByPlayfab } from "./serverProfilesApi"
import {
  missingMessageVariables,
  resolveMessageTemplate,
  type MessageVariable
} from "./messageTags"
import { applyServerMessagePrefix } from "./serverVariables"
import { profileUnbanApi, type ProfileUnbanApi } from "./profileUnban"

type ProfileCoreApi = Pick<ChivCoreApi, "executeBatch">

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
  beforeExecute?: () => Promise<void>
}

export type ProfileActionExecutionResult = {
  ok: boolean
  message: string
  sentCommands: number
  auditFailed?: boolean
}

export async function executeProfileAction(
  action: ServerProfileAction,
  context: ProfileActionExecutionContext,
  core: ProfileCoreApi = getCoreApi(),
  recordAction: typeof recordActionByPlayfab = recordActionByPlayfab,
  unbanApi: ProfileUnbanApi = profileUnbanApi,
): Promise<ProfileActionExecutionResult> {
  const commands = [...action.commands].sort(
    (left, right) => left.sortOrder - right.sortOrder
  )
  if (commands.some(command => command.commandType === `unban`)) {
    const playerId = context.playerId ?? context.dbProfile?.player.id
    if (!playerId || !context.gameServer) {
      return { ok: false, message: `Unban requires a resolved player and current server.`, sentCommands: 0 }
    }
    try {
      if (await unbanApi.fetchWanted(playerId)) {
        return { ok: false, message: `Wanted actions must be changed from the Wanted page.`, sentCommands: 0 }
      }
    } catch {
      return { ok: false, message: `Wanted status could not be checked.`, sentCommands: 0 }
    }
  }
  if (action.blockOnMissingVariables) {
    const missing = missingMessageVariables(commands.map(command => command.message), context.variables ?? [])
    if (missing.length > 0) {
      const serverLabel = context.gameServer?.displayName?.trim()
        || context.gameServer?.name
        || context.serverName
      return {
        ok: false,
        message: `${serverLabel} does not have ${missing.map(key => `[${key}]`).join(`, `)}. ${action.label} was blocked.`,
        sentCommands: 0
      }
    }
  }
  const resolvedCommands = commands.map((command) => ({
    command,
    message: applyServerMessagePrefix(
      resolveMessageTags(command.message, command, context),
      `server`,
      context.variables ?? []
    )
  }))
  const playfabId = context.player?.playfabId

  if (resolvedCommands.some(({ command }) => isPlayerCommand(command)) && !playfabId) {
    return {
      ok: false,
      message: `Player commands require a selected player.`,
      sentCommands: 0
    }
  }

  const batch = resolvedCommands.map(({ command, message }) =>
    toCoreBatchCommand(command, message, action.delayMs ?? 0, playfabId)
  )
  await context.beforeExecute?.()
  const coreResult = await core.executeBatch(batch)
  const sentCommands =
    extractEnvelope<{ sentCommands: number }>(coreResult)?.data?.sentCommands ?? 0
  const auditFailure = await recordSubmittedActions(
    resolvedCommands.slice(0, sentCommands),
    context,
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
  const offenseCount = context.dbProfile?.actions.filter(action => action.actionType !== `unban`).length ?? 0
  const serverTags = context.gameServer
    ? {
        serverName: context.gameServer.displayName?.trim() || context.gameServer.name,
        clanName: context.gameServer.clanName ?? ``,
        clanTag: context.gameServer.clanTag ?? ``
      }
    : {}

  return resolveMessageTemplate(template, {
    user: context.player?.name,
    duration,
    admin: context.admin.displayName?.trim() || context.admin.username,
    playfab: context.player?.playfabId,
    offenses: offenseCount.toString(),
    variables: context.variables,
    ...serverTags
  })
}

function isPlayerCommand(command: ServerProfileCommand): boolean {
  return command.commandType !== `server_message`
}

function toCoreBatchCommand(
  command: ServerProfileCommand,
  message: string,
  actionDelayMs: number,
  playfabId?: string
): CoreBatchCommand {
  const batchCommand: CoreBatchCommand = {
    commandType: command.commandType,
    message,
    delayMs: command.delayMs + actionDelayMs
  }

  if (command.commandType === `kick` || command.commandType === `unban`) {
    return { ...batchCommand, playfabId: playfabId! }
  }

  if (command.commandType === `ban`) {
    return {
      ...batchCommand,
      playfabId: playfabId!,
      hours: command.durationHours ?? 1
    }
  }

  return batchCommand
}

async function recordSubmittedActions(
  commands: ResolvedCommand[],
  context: ProfileActionExecutionContext,
  recordAction: typeof recordActionByPlayfab,
  unbanApi: ProfileUnbanApi,
): Promise<Omit<ProfileActionExecutionResult, "sentCommands"> | null> {
  if (!context.player) return null
  const offenseCommands = commands.filter(({ command }) => command.commandType !== `server_message`)

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
    if (command.commandType === `server_message`) continue

    try {
      if (command.commandType === `unban`) {
        await unbanApi.record({
          playfabId: context.player.playfabId,
          playerName: context.player.name,
          gameServerId: context.gameServer.id,
          reason: message,
        }, context.relatedActionId ? {
          playerId: (context.playerId ?? context.dbProfile?.player.id)!,
          actionId: context.relatedActionId,
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
        duration: hacker || command.durationHours === 999999 ? null : command.durationHours ?? null,
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
