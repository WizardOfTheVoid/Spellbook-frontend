export const pingVectorMethod = {
  maxPairGapMs: 300000,
  minimumVariationPairs: 2,
  quantileMethod: `linearInterpolation`,
  deviationMethod: `population`,
  percentageDenominator: `medianPing`
} as const

export const maxForensicsSamples = 10000

export type PingSummary = {
  sampleCount: number
  observedDateCount: number
  firstObservedAt: string | null
  lastObservedAt: string | null
  meanMs: number | null
  medianMs: number | null
  minMs: number | null
  maxMs: number | null
  p10Ms: number | null
  p90Ms: number | null
  standardDeviationMs: number | null
  variationPairCount: number
  excludedGapCount: number
  meanAbsoluteChangeMs: number | null
  variationPercent: number | null
}

export type OverallPingSummary = PingSummary & { serverCount: number }
export type BackendPingContext = { pingMs: number, observedAt: string }
export type ServerPingSummary = PingSummary & {
  serverId: number
  serverName: string | null
  deleted: boolean
  backendPingContext: BackendPingContext | null
}

export type PingVectorDescriptor = {
  key: `ping`
  version: 1
  state: `available`
  metricUnits: Record<Exclude<keyof PingSummary, `firstObservedAt` | `lastObservedAt`>, `ms` | `percent` | `count`>
  method: typeof pingVectorMethod
}

export type AltVectorDescriptor = PingVectorDescriptor | import('./triangulation.js').TriangulationDescriptor

export type AltVectorCatalog = { schemaVersion: 1, vectors: AltVectorDescriptor[] }

export type PingVectorProfile = {
  schemaVersion: 1
  vectorKey: `ping`
  calculationVersion: 1
  playerId: number
  calculatedAt: string
  status: `available` | `noData`
  source: {
    kind: `retainedPlayerPings`
    sampleIntervalSeconds: number
    maxSamplesPerPlayerServer: number
    historyComplete: false
  }
  method: typeof pingVectorMethod
  overall: OverallPingSummary
  servers: ServerPingSummary[]
  discardedSampleCount: number
  limitations: Array<`retainedSamplesOnly` | `sessionHistoryUnavailable` | `endpointHistoryUnavailable` | `noHistoricalBackendBaseline` | `invalidSamplesSkipped`>
}
