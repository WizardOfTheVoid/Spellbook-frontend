import { playerBanCommand } from '@spellbook/shared/playerBans'
import type { ActionCommand } from '@spellbook/shared/actions/actionTypes'
import { actionsApi } from './actionsApi'

export async function checkPlayerBans(playfabId: string, gameServerId: number, commands: readonly ActionCommand[]) {
  const resolved: ActionCommand[] = []
  for (const command of commands) {
    if (command.commandType === `incremental_ban`) {
      const result = await actionsApi<{ durationHours: number }>(`checkPlayerAction`, {
        playfabId, gameServerId, ...playerBanCommand({ ...command, commandType: `ban` }),
        scope: `local`, incrementalBan: command.incrementalBan
      })
      if (!Number.isInteger(result.durationHours) || result.durationHours < 1 || result.durationHours > 999999) throw new Error(`Could not resolve incremental ban duration.`)
      const { incrementalBan, ...ban } = command
      resolved.push({ ...ban, commandType: `ban`, durationHours: result.durationHours })
    } else {
      if (command.commandType === `ban`) await actionsApi(`checkPlayerAction`, { playfabId, gameServerId, ...playerBanCommand(command), scope: `local` })
      resolved.push(command)
    }
  }
  return resolved
}
