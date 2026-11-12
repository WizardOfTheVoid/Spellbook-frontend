import type { ActionEvent, ActionEventsCatalog, ActionEventsQuery, ActionEventsTeamScope } from './actionEventsTypes'
import { createActionEventsQuery } from '@spellbook/shared/actionEvents'
export { createActionEventsQuery } from '@spellbook/shared/actionEvents'

export function normalizeActionEventsQuery(query: ActionEventsQuery): ActionEventsQuery {
  return createActionEventsQuery({ ...query, status: query.status === `superseded` ? `all` : query.status,
    teams: query.teams.mode === `mine` ? { mode: `all`, ids: [] } : query.teams,
    sources: query.sources.filter(source => source === `spellbook` || source === `discord`) })
}

export function scopeActionEventsCatalog(catalog: ActionEventsCatalog, canViewAllTeams: boolean): ActionEventsCatalog {
  if (canViewAllTeams) return catalog
  const teams = catalog.teams.filter(team => team.isMine)
  const teamIds = new Set(teams.map(team => team.id))
  const admins = catalog.admins.map(admin => ({ ...admin, teamIds: admin.teamIds.filter(id => teamIds.has(id)) })).filter(admin => admin.teamIds.length)
  return { ...catalog, teams, admins }
}

export function setActionEventsSystem(query: ActionEventsQuery): ActionEventsQuery {
  return createActionEventsQuery({ ...query, systemOnly: !query.systemOnly, admins: [], sources: [] })
}

export function setActionEventsSource(query: ActionEventsQuery, source: `spellbook` | `discord`): ActionEventsQuery {
  return { ...query, systemOnly: false, sources: query.sources.includes(source) ? query.sources.filter(value => value !== source) : [...query.sources, source] }
}

export function setActionEventsAdmins(query: ActionEventsQuery, admins: number[]): ActionEventsQuery {
  return { ...query, systemOnly: false, admins }
}

export function actionEventsDateBounds(start: Date | number | null, end: Date | number | null): Pick<ActionEventsQuery, `since` | `until`> {
  const midnight = (value: Date | number, nextDay = false) => {
    const date = new Date(value)
    date.setHours(0, 0, 0, 0)
    if (nextDay) date.setDate(date.getDate() + 1)
    return date.getTime()
  }
  return { since: start === null ? null : midnight(start), until: end === null ? null : midnight(end, true) }
}

export function actionEventsDatePresets(today: Date) {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12).getTime()
  const recent = [1, 7, 30].map(days => ({ label: days === 1 ? `Today` : `Last ${days} days`,
    start: new Date(today.getFullYear(), today.getMonth(), today.getDate() - days + 1, 12).getTime(), end }))
  return [...recent, { label: `All time`, start: null, end: null }]
}

export function canFollowActionEvents(query: ActionEventsQuery, now = Date.now()): boolean {
  return query.until === null || query.until > now
}

export function actionEventsAdvancedCount(query: ActionEventsQuery): number {
  return Number(query.since !== null || query.until !== null) + Number(query.servers.length > 0)
    + Number(query.teams.mode !== `all`) + Number(query.admins.length > 0) + Number(query.actionTypes.length > 0)
}

export function hasActionEventsFilters(query: ActionEventsQuery): boolean {
  return Boolean(query.search || query.systemOnly || query.sources.length
    || query.status !== `all` || actionEventsAdvancedCount(query))
}

export function actionEventsTeamIds(scope: ActionEventsTeamScope, catalog: ActionEventsCatalog): number[] {
  return catalog.teams.filter(team => scope.mode === `all` || (scope.mode === `mine` ? team.isMine : scope.ids.includes(team.id))).map(team => team.id)
}

export function actionEventsAdmins(scope: ActionEventsTeamScope, catalog: ActionEventsCatalog) {
  if (scope.mode === `all`) return catalog.admins
  const teamIds = actionEventsTeamIds(scope, catalog)
  return catalog.admins.filter(admin => admin.teamIds.some(id => teamIds.includes(id)))
}

export function setActionEventsTeams(query: ActionEventsQuery, teams: ActionEventsTeamScope, catalog: ActionEventsCatalog): ActionEventsQuery {
  const validAdmins = new Set(actionEventsAdmins(teams, catalog).map(admin => admin.id))
  return { ...query, teams, admins: query.admins.filter(id => validAdmins.has(id)) }
}

export function selectActionEventsTeams(query: ActionEventsQuery, ids: number[], catalog: ActionEventsCatalog): ActionEventsQuery {
  return setActionEventsTeams(query, { mode: ids.length ? `selected` : `all`, ids }, catalog)
}

export function actionEventsSearchText(event: ActionEvent): string {
  return normalizeActionEventsSearch([
    event.id, event.admin?.name, event.admin?.player?.playfabId, event.ruleset,
    event.action.label, ...event.action.commands.map(command => command.message), event.server.name, event.server.id, event.reason,
    event.target.type === `player` ? `${event.target.player.name} ${event.target.player.playfabId}` : ``
  ].join(` `))
}

export function normalizeActionEventsSearch(value: string): string {
  return value.normalize(`NFKD`).replace(/\p{M}/gu, ``).toLocaleLowerCase().trim()
}

export function matchesActionEvent(event: ActionEvent, query: ActionEventsQuery, catalog: ActionEventsCatalog,
  searchText = actionEventsSearchText(event), teamIds = actionEventsTeamIds(query.teams, catalog)): boolean {
  if (event.team ? !teamIds.includes(event.team.id) : query.teams.mode !== `all`) return false
  if (event.origin === `ruleset` || (event.execution === `automatic`) !== query.systemOnly) return false
  if (query.admins.length && (!event.admin || !query.admins.includes(event.admin.id))) return false
  if (query.servers.length && !query.servers.includes(event.server.id)) return false
  if (query.sources.length && !query.sources.some(source => source === (event.origin ?? `unknown`))) return false
  if (query.actionTypes.length && !event.action.commands.some(command => query.actionTypes.includes(command.commandType === `incremental_ban` ? `ban` : command.commandType))) return false
  if (query.since !== null && Date.parse(event.requestedAt) < query.since) return false
  if (query.until !== null && Date.parse(event.requestedAt) >= query.until) return false
  if (!matchesActionEventsStatus(event.status, query.status)) return false
  return searchText.includes(normalizeActionEventsSearch(query.search))
}

export const actionEventStatuses = {
  pending: { label: `Pending`, icon: `fa-clock`, tone: `warning` },
  claimed: { label: `Starting`, icon: `fa-hourglass-half`, tone: `warning` },
  submitting: { label: `Running`, icon: `fa-circle-notch`, tone: `accent` },
  completed: { label: `Completed`, icon: `fa-circle-check`, tone: `success` },
  failed: { label: `Failed`, icon: `fa-circle-xmark`, tone: `danger` },
  cancelled: { label: `Cancelled`, icon: `fa-ban`, tone: `muted` },
  expired: { label: `Expired`, icon: `fa-hourglass-end`, tone: `warning` },
  superseded: { label: `Replaced`, icon: `fa-arrow-right-arrow-left`, tone: `muted` },
  unknown: { label: `Unknown`, icon: `fa-circle-question`, tone: `muted` }
} as const

export function matchesActionEventsStatus(status: ActionEvent[`status`], filter: ActionEventsQuery[`status`]): boolean {
  return filter === `all` || (filter === `pending` ? [`pending`, `claimed`, `submitting`].includes(status) : status === filter)
}

export const actionEventOrigins = { spellbook: `SpellBook`, discord: `Discord`, ruleset: `Ruleset` } as const
