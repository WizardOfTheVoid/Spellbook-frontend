export type TelemetryTab = `overview` | `kills` | `combat` | `items` | `map`
export type TelemetryMode = `live` | `paused` | `playing`
export type Vec3 = { x: number, y: number, z: number }
export type MetricSample = { timeMs: number, value: number | null, lifetimeId: string }
export type InventorySlot = { slot: string, item: string | null }

export type TelemetryPlayer = {
  id: string
  name: string | null
  playFabId: string | null
  direction?: `fromServer` | `toServer`
  observationKind?: `pawn` | `account`
  aliases?: string[]
  firstSeenMs: number
  lastSeenMs: number
  present: boolean
  lifetimeId: string
  health: number | null
  maxHealth: number | null
  stamina: number | null
  position: Vec3 | null
  speed: number | null
  inventory: InventorySlot[]
  inventoryKnown?: boolean
  healthHistory: MetricSample[]
  staminaHistory: MetricSample[]
  damageDealt: number | null
  damageTaken: number | null
  deathCount: number | null
  statuses: string[]
  combatState?: number | null
  attackIndex?: number | null
  score?: number | null
  profile?: Record<string, unknown> | null
  detailTruncated?: boolean
}

export type TelemetryEventKind =
  | `damage` | `heal` | `death` | `disconnect`
  | `attackStart` | `attackCancel`
  | `itemObserved` | `itemDestroyed` | `inventoryChanged`
  | `abilityInitiated` | `abilityInvocationCompleted` | `abilityRequested`
  | `heavyAttackDecision` | `heldInputAdded` | `heldInputRemoved` | `parryRequested`
  | `statusChanged` | `combatStateChanged` | `playerStateUpdated` | `playerStatistics`
  | `accountStateObserved` | `componentStateObserved` | `inventoryClassChanged`
  | `itemReappeared` | `itemDormant` | `itemNoLongerRelevant` | `itemChannelClosed` | `itemTornOff`
  | `itemOwnerChanged` | `itemInstigatorChanged` | `itemCoverageReset` | `itemClassified`
  | `objectObserved` | `objectReappeared` | `objectDestroyed` | `objectDormant`
  | `objectNoLongerRelevant` | `objectChannelClosed` | `objectTornOff`

export type TelemetryEvent = {
  id: string
  timeMs: number
  kind: TelemetryEventKind
  actorId: string | null
  targetId: string | null
  contributorIds: string[]
  itemClass: string | null
  relationship: `owner` | `instigator` | null
  amount: number | null
  count: number
  detail: string
  participantRoles?: Record<string, string>
  values?: Record<string, unknown>
  reasonCode?: number | null
  detailTruncated?: boolean
}

export type TelemetryPath = {
  playerId: string
  lifetimeId: string
  points: { timeMs: number, position: Vec3 }[]
}

export type TelemetrySnapshot = {
  timeMs: number
  players: TelemetryPlayer[]
  events: TelemetryEvent[]
  paths: TelemetryPath[]
  totals?: {
    players: number
    present: number
    damage: number | null
    deaths: number | null
    items: number | null
  }
  eventPage?: {
    page: number
    total: number
    hasNext: boolean
    nextOffset?: number | null
    counts: Partial<Record<TelemetryEventKind, number>>
    amounts: Partial<Record<TelemetryEventKind, number | null>>
  }
  coverage?: Record<string, number>
  richFieldsAvailable?: boolean
  omittedMapPlayers?: number
  roster?: { playerIds: string[], page: number, hasNext: boolean, nextOffset: number | null }
  resolvedSelectionId?: string
}

export type TelemetrySession = {
  id: string
  name: string
  serverName: string
  startedAt: number
  durationMs: number
  status: `recording` | `saved`
  captureState?: string
  decoderVersion?: string
}

export type TelemetryWorkspace = {
  sessionId: string | null
  cursorMs: number
  mode: TelemetryMode
  speed: number
  selectedPlayerId: string | null
  selectedPlayerAnchorId?: string | null
  tab: TelemetryTab
  desiredCursorMs?: number
  rosterPage?: number
  rosterOffsets?: number[]
}

export type TelemetryPreviewState = {
  source: `live` | `recordings`
  live: TelemetryWorkspace
  replay: TelemetryWorkspace
  liveSession: TelemetrySession | null
  recordings: TelemetrySession[]
  headMs: number
}

export interface TelemetrySessionSource {
  getSnapshot(sessionId: string, timeMs: number): TelemetrySnapshot
}
