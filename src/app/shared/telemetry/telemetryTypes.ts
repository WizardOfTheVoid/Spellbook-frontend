import type { PlayerEventData, PlayerStateSnapshot, TelemetryCapabilities, TelemetrySummary } from './telemetryPlayerTypes'
import type { MetricHistoryPage, MetricHistoryQuery, PlayerPage, PlayerQuery, ReadContext, ReadView } from './telemetryReadTypes'
export type * from './telemetryPlayerTypes'
export type * from './telemetryReadTypes'

export const telemetryProtocolVersion = 1
export const maxTelemetryBytes = 1024 * 1024

export type Endpoint = { host: string; port: number }
export type StreamCursor = { generation: string; updateSequence: number }
export type CommittedHead = { sequence: number; elapsedUs: number }
export type CoordinateSpace = `world` | `baseRelative` | `unknown`
export type Vec3 = { x: number; y: number; z: number }
export type TelemetryPosition = {
  entityId: string
  elapsedUs: number
  ordinal: number
  sequence: number
  location: Vec3
  rawLocation: Vec3
  source: string
  coordinateSpace: CoordinateSpace
  baseGuid: number
  reason: string
  playFabId?: string | null
  playerStateGuid?: number | null
  sourceUtc?: string | null
}
export type TelemetryEntity = {
  entityId: string
  actorGuid: number
  channel: number
  kind: string
  active: boolean
  playFabId?: string | null
  name?: string | null
  identityKnownAtUs?: number | null
  position?: TelemetryPosition | null
  nameObservedAtUtc?: string | null
  direction?: `fromServer` | `toServer`
  provisional?: boolean
}
export type ItemEventData = {
  classPath: string
  actorGuid: number
  ownerGuid?: number | null
  instigatorGuid?: number | null
  playFabId?: string | null
  attribution?: string | null
  closeReason?: number | null
  location?: Vec3 | null
  spawnLocationPresent?: boolean | null
}
export type TelemetryEvent = {
  sequence: number
  elapsedUs: number
  ordinal: number
  kind: string
  entityId?: string | null
  detail: string
  item?: ItemEventData | null
  count?: number
  lastElapsedUs?: number | null
  groupKey?: string | null
  player?: PlayerEventData | null
  detailTruncated?: boolean
}
export type RecordingStatus = {
  id: string
  endpoint: Endpoint
  state: `starting` | `recording` | `stopping` | `saved` | `interrupted` | `failed`
  requestedAtUtc: string
  startedAtUtc?: string | null
  stoppedAtUtc?: string | null
  head: CommittedHead
  revision: number
  generation: string
  sizeBytes: number
  packetCount: number
  lossCount: number
  decoderVersion: string
  stopReason?: string | null
  projectionVersion?: number
  schemaVersion?: number
  derivedCapabilities?: string[]
}
export type TelemetryFrame = {
  recordingId: string
  revision: number
  atUs: number
  committedHead: CommittedHead
  cursor: StreamCursor
  entities: TelemetryEntity[]
  coverage: Record<string, number>
  readView?: ReadView | null
  players?: PlayerStateSnapshot[] | null
  summary?: TelemetrySummary | null
  capabilities?: TelemetryCapabilities | null
}
export type TrajectoryPath = {
  entityId: string
  coordinateSpace: CoordinateSpace
  points: TelemetryPosition[]
}
export type TrajectoryPage = {
  recordingId: string
  revision: number
  paths: TrajectoryPath[]
  truncated: boolean
  readView?: ReadView | null
}
export type EventQuery = ReadContext & {
  recordingId: string
  fromUs: number
  toUs: number
  afterSequence?: number
  limit?: number
  entityId?: string
  kinds?: string[]
  groupItems?: boolean
  newestFirst?: boolean
  readView?: ReadView
  trackId?: string
  search?: string
  offset?: number
}
export type EventPage = {
  recordingId: string
  revision: number
  events: TelemetryEvent[]
  nextSequence: number | null
  committedHead: CommittedHead
  readView?: ReadView | null
  matchingGroups?: number | null
  nextOffset?: number | null
}
export type TrajectoryQuery = ReadContext & {
  recordingId: string
  fromUs: number
  toUs: number
  entityIds: string[]
  maxPoints: number
  readView?: ReadView
}
export type TelemetryUpdate = {
  protocolVersion: number
  recordingId: string
  revision: number
  cursor: StreamCursor
  committedHead: CommittedHead
  kind: `changed` | `resync`
  state: RecordingStatus[`state`]
}
export type WorkerStatus = {
  protocolVersion: number
  instanceId: string
  processId: number
  version: string
  capture: { available: boolean; reason?: string }
  active: RecordingStatus | null
  error?: string | null
  capabilities?: string[]
}
export type NameObservation = {
  playFabId: string
  name: string
  source: `spellbookProduction`
  observedAtUtc: string
}
export type RecordingJob = {
  id: string
  recordingId: string
  kind: `import` | `reprocess`
  state: `queued` | `running` | `completed` | `cancelled` | `failed`
  processed: number
  total: number
  error?: string | null
}
export type TelemetryApi = {
  getStatus(): Promise<WorkerStatus>
  startRecording(input: { endpoint: Endpoint }): Promise<RecordingStatus>
  stopRecording(recordingId: string): Promise<RecordingStatus>
  listRecordings(): Promise<RecordingStatus[]>
  openRecording(recordingId: string): Promise<TelemetryFrame>
  importRecording(input?: { endpoint?: Endpoint }): Promise<RecordingJob | null>
  reprocessRecording(recordingId: string): Promise<RecordingJob>
  getJob(jobId: string): Promise<RecordingJob>
  cancelJob(jobId: string): Promise<RecordingJob>
  getFrame(input: ReadContext & {
    recordingId: string
    atUs: number
    trackId?: string
  }): Promise<TelemetryFrame>
  getPlayers(input: PlayerQuery): Promise<PlayerPage>
  getMetricHistory(input: MetricHistoryQuery): Promise<MetricHistoryPage>
  cancelReads(input: { workspaceId: `live` | `replay`; throughRequestId: number }): Promise<void>
  getTrajectories(input: TrajectoryQuery): Promise<TrajectoryPage>
  getEvents(input: EventQuery): Promise<EventPage>
  subscribeUpdates(
    input: { recordingId: string; cursor?: StreamCursor },
    listener: (update: TelemetryUpdate) => void,
    failed?: (error: string) => void
  ): () => void
}
