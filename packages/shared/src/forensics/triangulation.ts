import type { BackendPingContext, PingSummary, PingVectorProfile } from './altVectors.js'

export const triangulationMethod = {
  kind: `propagationBounds`, version: 1, validation: `unvalidated`, windowDays: 7,
  minimumPositiveSamples: 3, minimumIndependentLocations: 2, lowPercentile: 0.1,
  roundingAllowanceMs: 1, lightSpeedKmPerMs: 299.792458, boundaryResolutionKm: 10,
  maxOutputCells: 4096, maxVisitedCells: 50000, maxConstraints: 64, maxRadiusKm: 5000,
  numericalToleranceKm: 0.001, rttAssumption: `reportedGameRttMs`
} as const

export type GeographicPoint = { latitude: number, longitude: number }
export type TriangulationConstraint = GeographicPoint & { radiusKm: number, accuracyRadiusKm: number, serverIds: number[] }
export type TriangulationOutcome = `regionAvailable` | `noUsablePings` | `insufficientLocations` | `inconsistentReadings` | `unresolved` | `tooBroad` | `budgetExceeded`
export type TriangulationRegion = { type: `Feature`, properties: Record<string, never>, geometry: { type: `MultiPolygon`, coordinates: number[][][][] } }
export type TriangulationEstimate = {
  status: TriangulationOutcome
  method: typeof triangulationMethod
  calibrationVersion: null
  region: TriangulationRegion | null
  circle: (GeographicPoint & { radiusKm: number }) | null
  areaKm2: number | null
  resolutionKm: number
  usedConstraintCount: number
  visitedCellCount: number
}
export type TriangulationEvidence = {
  status: `ready` | `noUsablePings` | `insufficientLocations` | `tooBroad` | `budgetExceeded`
  window: { start: string | null, end: string | null }
  positiveSampleCount: number
  usedSampleCount: number
  independentLocationCount: number
  constraints: TriangulationConstraint[]
  servers: Array<{ serverId: number, sampleCount: number, p10Ms: number, radiusKm: number, baselineTimeOffsetMs: number | null }>
  excluded: { invalid: number, zero: number, outsideWindow: number, missingLocation: number, insufficientSamples: number, unconstraining: number }
}

export type ServerLocation = {
  latitude: number
  longitude: number
  accuracyRadiusKm: number | null
  source: string | null
  checkedAt: string | null
}

export type TriangulationDescriptor = {
  key: `triangulate`
  version: 2
  state: `exploratory`
  metricUnits: { sampleCount: `count`, mappedServerCount: `count`, distinctLocationCount: `count`, areaKm2: `km2` }
  method: typeof triangulationMethod & { mode: `propagationConstraints`, locationSnapshot: `currentServerGeo` }
}

export type TriangulationMapServer = { serverId: number, serverName: string | null, deleted: boolean, location: ServerLocation, backendPingContext: BackendPingContext | null }
export type TriangulationMapCatalog = { servers: TriangulationMapServer[], truncated: boolean }

export type TriangulationProfile = {
  schemaVersion: 1
  analysisVersion: 2
  playerId: number
  calculatedAt: string
  mode: `propagationConstraints`
  status: `mapped` | `noData` | `noLocatedServers`
  source: PingVectorProfile[`source`] & { locationSnapshot: `currentServerGeo` }
  coverage: {
    sampleCount: number
    serverCount: number
    mappedServerCount: number
    unlocatedServerCount: number
    distinctLocationCount: number
    firstObservedAt: string | null
    lastObservedAt: string | null
  }
  servers: Array<{ serverId: number, serverName: string | null, deleted: boolean, ping: PingSummary, location: ServerLocation | null, backendPingContext: BackendPingContext | null }>
  map: TriangulationMapCatalog
  evidence: TriangulationEvidence
  estimate: TriangulationEstimate
  discardedSampleCount: number
  limitations: string[]
}

export function normalizeServerLocation(input: { latitude?: unknown, longitude?: unknown, accuracyRadiusKm?: unknown, source?: unknown, checkedAt?: unknown }): ServerLocation | null {
  const numeric = (value: unknown) => (typeof value === `number` || typeof value === `string` && value.trim() !== ``) && Number.isFinite(Number(value)) ? Number(value) : null
  const latitude = numeric(input.latitude)
  const longitude = numeric(input.longitude)
  if (latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null
  const radius = numeric(input.accuracyRadiusKm)
  const time = typeof input.checkedAt === `string` ? Date.parse(input.checkedAt) : NaN
  return { latitude, longitude, accuracyRadiusKm: radius !== null && radius >= 0 ? radius : null,
    source: typeof input.source === `string` && input.source.trim() ? input.source : null,
    checkedAt: Number.isFinite(time) ? new Date(time).toISOString() : null }
}
