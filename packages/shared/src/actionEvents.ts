import type { ActionCommandType, ActionStatus, ActionTarget } from './actions/actionTypes.js'
import type { ServerProfileActionIconKey } from './serverProfileActionIcons.js'

export const actionEventsLimits = { search: 200, selections: 100, page: 100, commands: 200, message: 512, label: 200 } as const
export type ActionEventsTeam = { id: number, name: string, isMine: boolean }
export type ActionEventsPlayer = { id: number | null, name: string, playfabId: string, canOpen: boolean }
export type ActionEventsAdmin = { id: number, name: string, teamIds: number[], avatarUrl?: string, player?: ActionEventsPlayer }
export type ActionEventAction = { label: string, iconKey: ServerProfileActionIconKey, commands: { commandType: ActionCommandType, message?: string }[] }
export type ActionEvent = {
  id: number
  admin: ActionEventsAdmin | null
  ruleset: string | null
  action: ActionEventAction
  target: { type: `player`, player: ActionEventsPlayer } | { type: `server` }
  team: ActionEventsTeam | null
  server: { id: number, name: string, avatarUrl?: string, canOpen: boolean }
  origin: `spellbook` | `discord` | `ruleset` | null
  execution: `manual` | `automatic`
  status: ActionStatus
  requestedAt: string
  completedAt: string | null
  reason: string
  canCancel: boolean
}
export type ActionEventsCatalog = { teams: ActionEventsTeam[], admins: ActionEventsAdmin[], servers: { id: number, name: string }[] }
export const actionEventSources = [`spellbook`, `discord`, `unknown`] as const
export const actionEventTypes = [`ban`, `unban`, `kick`, `warn`, `server_message`, `admin_message`] as const
export type ActionEventsTeamScope = { mode: `all` | `mine` | `selected`, ids: number[] }
export type ActionEventsStatus = `all` | `pending` | Exclude<ActionStatus, `claimed` | `submitting`>
export type ActionEventsQuery = {
  search: string
  teams: ActionEventsTeamScope
  admins: number[]
  systemOnly: boolean
  servers: number[]
  sources: (typeof actionEventSources)[number][]
  actionTypes: (typeof actionEventTypes)[number][]
  status: ActionEventsStatus
  since: number | null
  until: number | null
}
export function createActionEventsQuery(query: Partial<ActionEventsQuery> = {}): ActionEventsQuery {
  const result: ActionEventsQuery = { search: ``, teams: { mode: `all`, ids: [] }, admins: [], status: `all`, since: null, until: null,
    systemOnly: false, servers: [], sources: [], actionTypes: [], ...query }
  return result.systemOnly ? { ...result, admins: [], sources: [] } : result
}
export type ActionEventsPage = { items: ActionEvent[], nextCursor: string | null, total?: number }
export type LocalActionReport = {
  coreActionId: string
  gameServerId: number
  target: ActionTarget
  profile?: { profileId: number, actionKey: string }
  action: ActionEventAction
  requestedAt: string
  completedAt: string
  status: `completed` | `failed` | `cancelled` | `unknown`
  sentCommands: number | null
}
