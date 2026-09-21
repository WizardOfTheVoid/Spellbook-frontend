import { formatFullDateTime } from '../dateFormatting.js'
import { validTimezone } from './actionTime.js'

export type MessageFacts = {
  adminsOnline?: number | null
  playersOnline?: number | null
  playerRank?: number | null
  lastLogin?: string | null
  playtimeHours?: number | null
  timezone?: string
  now?: string
}

export function usesServerMessageFacts(commands: readonly { message: string }[]): boolean {
  return commands.some(command => /\[(?:admins_online|players_online|current_time|current_time_utc|last_login)(?:\||\])/u.test(command.message))
}

export function messageFactValues(context: MessageFacts): Record<string, string> {
  const now = new Date(context.now ?? Date.now())
  const zone = context.timezone && validTimezone(context.timezone) ? context.timezone : `UTC`
  const login = context.lastLogin ? new Date(context.lastLogin) : null
  const hasLogin = login !== null && Number.isFinite(login.getTime())
  const days = hasLogin ? Math.max(0, Math.floor((now.getTime() - login.getTime()) / 86400000)) : 0
  const time = (timeZone: string) => now.toLocaleTimeString([], { timeZone, hour: `2-digit`, minute: `2-digit`, second: `2-digit`, hour12: false })
  const number = (value: number | null | undefined) => typeof value === `number` && Number.isFinite(value) ? String(value) : ``
  return {
    admins_online: number(context.adminsOnline),
    players_online: number(context.playersOnline),
    player_rank: number(context.playerRank),
    playtime: number(context.playtimeHours),
    last_login: hasLogin ? formatFullDateTime(context.lastLogin, zone) : ``,
    last_login_alt: hasLogin ? `${days} day${days === 1 ? `` : `s`} ago` : ``,
    current_time: time(zone),
    current_time_utc: time(`UTC`)
  }
}
