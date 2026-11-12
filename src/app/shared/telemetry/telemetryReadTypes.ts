import type { PlayerStateSnapshot } from './telemetryPlayerTypes'

export type ReadContext = {
  workspaceId?: `live` | `replay`
  requestId?: number
}

export type ReadView = {
  generation: string
  throughSequence: number
  atUs: number
}

export type PlayerQuery = ReadContext & {
  recordingId: string
  atUs: number
  offset?: number
  limit?: number
  lifetimeId?: string
  includeDeparted?: boolean
  readView?: ReadView
}

export type PlayerPage = {
  recordingId: string
  revision: number
  players: PlayerStateSnapshot[]
  nextOffset: number | null
  readView: ReadView
}

export type MetricHistoryQuery = ReadContext & {
  recordingId: string
  fromUs: number
  toUs: number
  trackId: string
  metrics?: (`health` | `stamina`)[]
  maxPoints: number
  readView?: ReadView
}

export type MetricPoint = { elapsedUs: number; value: number | null; lifetimeId: string }
export type MetricSeries = { metric: string; points: MetricPoint[] }
export type MetricHistoryPage = {
  recordingId: string
  revision: number
  series: MetricSeries[]
  truncated: boolean
  readView: ReadView
}
