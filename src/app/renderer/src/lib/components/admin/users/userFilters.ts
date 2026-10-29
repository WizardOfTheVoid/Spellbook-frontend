import { Temporal } from '@js-temporal/polyfill'
import { getAdminName } from '@spellbook/shared/adminName.js'
import type { AdminUserRecord } from '../../../core'
import { accountStatus, type AccountStatus } from '../accountStatus'

export type UserFilters = {
  search: string, statuses: AccountStatus[], teamIds: number[], noTeams: boolean,
  joinedFrom: string | null, joinedTo: string | null, activeFrom: string | null, activeTo: string | null
}
export type UserSort = { field: `lastActive` | `displayName` | `createdAt` | `currentVersion`, direction: `asc` | `desc` }
export const defaultUserFilters: UserFilters = { search: ``, statuses: [], teamIds: [], noTeams: false, joinedFrom: null, joinedTo: null, activeFrom: null, activeTo: null }
export const defaultUserSort: UserSort = { field: `lastActive`, direction: `desc` }

export function filterAndSortUsers(users: readonly AdminUserRecord[], filters: UserFilters, sort: UserSort, timeZone = `UTC`): AdminUserRecord[] {
  const search = filters.search.trim().replace(/^@/u, ``).toLocaleLowerCase()
  const date = (value: string | null): number | null => {
    const stamp = Date.parse(value ?? ``)
    return Number.isFinite(stamp) ? stamp : null
  }
  const inRange = (value: string | null, from: string | null, to: string | null): boolean => {
    if (!from && !to) return true
    const stamp = date(value)
    if (stamp === null) return false
    const day = Temporal.Instant.fromEpochMilliseconds(stamp).toZonedDateTimeISO(timeZone).toPlainDate().toString()
    return (!from || day >= from) && (!to || day <= to)
  }
  const primary = (user: AdminUserRecord): string | number | null => sort.field === `displayName` ? getAdminName(user)
    : sort.field === `currentVersion` ? user.currentVersion?.trim() || null : date(user[sort.field])
  return users.filter(user =>
    (!search || [getAdminName(user), user.username, user.playfabId, user.discordId, String(user.id)].some(value => value?.toLocaleLowerCase().includes(search)))
    && (!filters.statuses.length || filters.statuses.includes(accountStatus(user)))
    && (!filters.teamIds.length && !filters.noTeams || filters.noTeams && !user.teams.length || user.teams.some(team => filters.teamIds.includes(team.id)))
    && inRange(user.createdAt, filters.joinedFrom, filters.joinedTo)
    && inRange(user.lastActive, filters.activeFrom, filters.activeTo)
  ).sort((a, b) => compare(primary(a), primary(b), sort.direction)
    || compare(a.currentVersion?.trim() || null, b.currentVersion?.trim() || null, `desc`)
    || compare(getAdminName(a), getAdminName(b), `asc`) || a.id - b.id)
}

function compare(a: number | string | null, b: number | string | null, direction: `asc` | `desc`): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1
  const compared = typeof a === `number` && typeof b === `number` ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: `base` })
  return direction === `asc` ? compared : -compared
}
