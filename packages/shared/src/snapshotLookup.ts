export type SnapshotLookupDiagnostics = {
  requestId: string
  startedAt: string
  totalMs: number
  captureMs: number
  rosterMs?: number
  requestMs: number
  inferenceMs: number | null
  costUsd: number | null
  inputTokens: number | null
  confidence: number | null
  margin: number | null
  playerName: string | null
  outcome: string
}

export type PlayerDetectionResult = {
  player: { playfabId: string, name: string } | null
  proposedPlayer: { playfabId: string, name: string } | null
  confidence: number | null
  margin: number | null
  costUsd: number | null
  inputTokens: number | null
  inferenceMs: number
  reason: string
}

export type SnapshotLookupEvent = {
  requestId: string
  phase: `started` | `finished`
  ok?: boolean
  match?: { playfabId: string, gameServerId: number }
  error?: string
  diagnostics?: SnapshotLookupDiagnostics
}
