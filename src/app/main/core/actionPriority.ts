import type { CoreActionPriority, CoreCommand } from '../../shared/coreAction'

export type ActionSource = `user` | `listPlayers` | `wanted` | `antiAfk`

export function actionPriority(source: ActionSource, commands: CoreCommand[], sentinel = false): CoreActionPriority {
  if (source === `wanted`) return `high`
  if (source === `antiAfk`) return `normal`
  if (source === `listPlayers` || commands.every(command => command.type === `console` && /^listplayers$/iu.test(command.command.trim()))) {
    return sentinel ? `high` : `low`
  }
  return commands.some(command => command.type === `console` && /^banbyid(?:\s|$)/iu.test(command.command.trim())) ? `high` : `normal`
}
