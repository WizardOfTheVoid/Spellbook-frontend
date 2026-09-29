import type { ActionCommand } from './actionTypes.js'

export function selfModerationIssue(
  commands: readonly Pick<ActionCommand, `commandType`>[],
  targetPlayfabId: string | null | undefined,
  ownPlayfabId: string | null | undefined
): string | null {
  if (!targetPlayfabId?.trim()) return null
  if (!commands.some(command =>
    command.commandType === `ban` || command.commandType === `incremental_ban` || command.commandType === `kick`)) return null
  if (!ownPlayfabId?.trim()) return `Your PlayFab ID is unavailable. Ban and kick actions are blocked.`
  return targetPlayfabId.trim().toUpperCase() === ownPlayfabId.trim().toUpperCase()
    ? `You cannot ban or kick yourself.` : null
}
