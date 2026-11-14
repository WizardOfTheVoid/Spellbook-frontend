import type { CommandProvenance } from './commandObservations.js'

export type PlayerTimelineTarget =
  | { type: `action`, id: number, playerId?: number, playfabId?: string }
  | { type: `server`, id: number }
  | { type: `evidence`, id: number }
export type PlayerTimelineSegment = { text: string, target?: PlayerTimelineTarget, tooltip?: string }
export type PlayerTimelineDetail = {
  label: string
  value: string
  format?: `dateTime` | `command`
  commandName?: string
  target?: PlayerTimelineTarget
  tooltip?: string
}

export type PlayerTimelineEvent = {
  commandProvenance?: CommandProvenance[]
  id: string
  kind: string
  occurredAt: string
  summary: string
  segments?: PlayerTimelineSegment[]
  details: PlayerTimelineDetail[]
}

export type PlayerTimelinePage = {
  events: PlayerTimelineEvent[]
  nextCursor: string | null
}
