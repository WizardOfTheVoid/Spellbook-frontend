export type PlayerTimelineTarget = { type: `action` | `server`, id: number }
export type PlayerTimelineSegment = { text: string, target?: PlayerTimelineTarget, tooltip?: string }
export type PlayerTimelineDetail = {
  label: string
  value: string
  format?: `dateTime`
  target?: PlayerTimelineTarget
  tooltip?: string
}

export type PlayerTimelineEvent = {
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
