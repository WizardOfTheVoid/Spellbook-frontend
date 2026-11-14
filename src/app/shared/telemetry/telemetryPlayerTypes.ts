export type PlayerReference = {
  trackId: string | null
  lifetimeId: string | null
  entityId: string | null
  actorGuid: number
  playerStateGuid?: number | null
  playFabId?: string | null
}

export type ObservationSource = {
  direction: string
  channel: number
  actorGuid: number
  objectGuid: number
  classPath: string | null
  startBit: number
  endBit: number
  totalBits: number
  completionOrdinal: number
  coverage: string
  fieldId?: number | null
  rawBody?: string | null
  connectionKey?: string | null
}

export type PlayerStateSnapshot = {
  trackId: string
  lifetimeId: string
  entityId: string
  actorGuid: number
  active: boolean
  elapsedUs: number
  sequence: number
  direction?: string
  observationKind?: `pawn` | `account`
  playerStateGuid?: number | null
  playFabId?: string | null
  name?: string | null
  health?: number | null
  maxHealth?: number | null
  stamina?: number | null
  inventory?: { index: number; itemGuid: number | null; classPath?: string | null }[] | null
  statuses?: { index: number; value: number | null }[] | null
  combatState?: number | null
  attackIndex?: number | null
  score?: number | null
  damageDealt?: number | null
  damageReceived?: number | null
  kills?: number | null
  deaths?: number | null
  profile?: Record<string, unknown> | null
  aliases?: string[] | null
  source?: ObservationSource | null
  detailTruncated?: boolean
}

export type PlayerEventData = {
  actor?: PlayerReference | null
  target?: PlayerReference | null
  contributors?: PlayerReference[] | null
  amount?: number | null
  resultingValue?: number | null
  reasonCode?: number | null
  values?: Record<string, unknown> | null
  source?: ObservationSource | null
}

export type TelemetrySummary = {
  activePlayers: number
  knownPlayers: number
  counts: Record<string, number>
  damageDealt?: number | null
  damageReceived?: number | null
  kills?: number | null
  deaths?: number | null
  healAmount?: number | null
}

export type TelemetryCapabilities = {
  schemaVersion: number
  projectionVersion: number
  players: boolean
  metricHistory: boolean
}
