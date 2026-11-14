import type { ActionCommand } from './actions/actionTypes.js'

export const playerOffenseTypes = [`hacker`, `ffa`, `verbal_abuse`, `griefing`, `exploiting`, `toxic_behavior`, `low_level`, `votekick_abuse`, `other`] as const

export type PlayerBanIdentity = { actionType: string, offenseType: string | null, duration: number | null }

export function playerBanCommand(command: Pick<ActionCommand, `commandType` | `offenseType` | `durationHours`>): PlayerBanIdentity {
  return { actionType: command.commandType, offenseType: command.offenseType ?? `other`,
    duration: command.offenseType === `hacker` || command.durationHours === 999999 ? null : command.durationHours ?? 1 }
}

export function findMatchingPlayerBan<T extends PlayerBanIdentity>(input: PlayerBanIdentity, activeBans: readonly T[]): T | undefined {
  return input.actionType === `ban` ? activeBans.find(ban => ban.actionType === `ban`
    && ban.offenseType === input.offenseType && ban.duration === input.duration) : undefined
}

export function repeatedBanCommandIssue(commands: readonly ActionCommand[]): string | null {
  const bans = commands.filter(command => command.commandType === `ban`).map(playerBanCommand)
  return bans.some((ban, index) => findMatchingPlayerBan(ban, bans.slice(0, index)))
    ? `This action contains an identical ban more than once.` : null
}

export type PlayerBanState = {
  id: number
  actionType: string
  gameServerId: number | null
  createdAt: string | Date
  duration: number | null
  expiresAt: string | Date | null
  relatedActionId: number | null
}

export function isPlayerBanActive(ban: PlayerBanState, actions: readonly PlayerBanState[], now = new Date()): boolean {
  const created = new Date(ban.createdAt).getTime()
  if (ban.actionType !== `ban` || !Number.isFinite(created) || created > now.getTime()) return false
  const lifted = actions.some(action => action.actionType === `unban` && action.gameServerId === ban.gameServerId
    && new Date(action.createdAt).getTime() <= now.getTime()
    && new Date(action.createdAt).getTime() >= created
    && (action.relatedActionId === ban.id || action.relatedActionId === null && (new Date(action.createdAt).getTime() > created
      || new Date(action.createdAt).getTime() === created && action.id > ban.id)))
  if (lifted) return false
  const expires = ban.expiresAt === null ? created + Number(ban.duration) * 3600000 : new Date(ban.expiresAt).getTime()
  return ban.duration === null || Number.isFinite(expires) && expires > now.getTime()
}
