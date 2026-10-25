import type { ActionEventsHistory } from './actionEventsHistory'

export type { ActionEvent, ActionEventsTeam, ActionEventsAdmin, ActionEventsPlayer, ActionEventsCatalog, ActionEventsTeamScope,
  ActionEventsStatus, ActionEventsQuery, ActionEventsPage } from '@spellbook/shared/actionEvents'
import type { ActionEvent, ActionEventsCatalog, ActionEventsQuery, ActionEventsPage } from '@spellbook/shared/actionEvents'
export type ActionEventsSource = {
  catalog: ActionEventsCatalog
  list(input: { query: ActionEventsQuery, cursor?: string, limit: number, signal: AbortSignal }): Promise<ActionEventsPage>
  cancel(input: { id: number, signal: AbortSignal }): Promise<ActionEvent>
}
export type ActionEventsState = {
  query: ActionEventsQuery
  items: ActionEvent[]
  nextCursor: string | null
  total: number | null
  mode: `live` | `browsing`
  loading: `initial` | `poll` | `append` | `resume` | null
  error: string
  failedOperation: `initial` | `poll` | `append` | `resume` | `cancel` | null
  refreshedAt: number | null
  pendingIds: number[]
}
export type ActionEventsAnchor = { key: string, offset: number }
export type ActionEventsSession = {
  history?: ActionEventsHistory
  accountId: number | null
  isSuperadmin?: boolean
  source?: ActionEventsSource
  catalog?: ActionEventsCatalog
  state?: ActionEventsState
  anchor?: ActionEventsAnchor | null
  scrollTop?: number
}
