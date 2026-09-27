import type { CoreActionPriority, CoreCommand } from '../../shared/coreAction'

export type ActionSource = `user` | `listPlayers` | `antiAfk`

export function actionPriority(source: ActionSource, _commands: CoreCommand[], sentinel = false): CoreActionPriority {
  if (source === `listPlayers`) return sentinel ? `high` : `low`
  return `normal`
}
