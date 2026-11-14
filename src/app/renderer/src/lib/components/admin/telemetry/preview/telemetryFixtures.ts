import type {
  MetricSample, TelemetryPath, TelemetryPlayer, TelemetrySession, TelemetrySessionSource, TelemetrySnapshot, Vec3
} from '../session/telemetryModels'
import { fixtureEvents } from './telemetryFixtureEvents'
import { aggregateItemEvents } from './telemetrySelectors'

const names = [`Aldric`, `Mira`, `Rook`, `Wren`, `Sable`, `Osric`, null, null]
const maximumHealth = [175, 100, 125, 120, 150, 175, 125, 100]
const deaths = new Map([[`p3`, { deathMs: 12_000, respawnMs: 18_000 }], [`p5`, { deathMs: 42_000, respawnMs: 50_000 }]])

function lifetime(id: string, timeMs: number) {
  return `${id}-life-${timeMs >= (deaths.get(id)?.respawnMs ?? Infinity) ? 2 : 1}`
}

function isDead(id: string, timeMs: number) {
  const death = deaths.get(id)
  return Boolean(death && timeMs >= death.deathMs && timeMs < death.respawnMs)
}

function isPresent(id: string, timeMs: number) {
  return id !== `p6` || timeMs < 24_000
}

function positionAt(index: number, timeMs: number, sessionId: string): Vec3 | null {
  const id = `p${index + 1}`
  if (!isPresent(id, timeMs) || isDead(id, timeMs) || (id === `p2` && timeMs >= 14_000 && timeMs < 18_000)) return null
  const phase = timeMs / 7000 + index * 0.7
  const offset = sessionId === `preview-bridge` ? 1200 : 0
  return {
    x: Math.round(4200 + index * 220 + Math.cos(phase) * (900 + index * 60) + offset),
    y: Math.round(3200 + index * 150 + Math.sin(phase) * (800 + index * 80)),
    z: Math.round(140 + Math.sin(phase * 0.5) * 35)
  }
}

function healthAt(index: number, timeMs: number): number | null {
  const id = `p${index + 1}`
  if (!isPresent(id, timeMs) || (id === `p4` && timeMs >= 10_000 && timeMs < 16_000)) return null
  const death = deaths.get(id)
  if (isDead(id, timeMs)) return timeMs < death!.deathMs + 1000 ? 0 : null
  const startMs = death && timeMs >= death.respawnMs ? death.respawnMs : 0
  let health = maximumHealth[index]
  for (const event of fixtureEvents) {
    if (event.timeMs > timeMs) break
    if (event.targetId !== id || event.timeMs < startMs) continue
    if (event.kind === `damage`) health = Math.max(0, health - (event.amount ?? 0))
    if (event.kind === `heal`) health = Math.min(maximumHealth[index], health + (event.amount ?? 0))
  }
  return health
}

function staminaAt(index: number, timeMs: number) {
  const id = `p${index + 1}`
  if (!isPresent(id, timeMs) || isDead(id, timeMs)) return null
  return Math.round(65 + 30 * Math.cos(timeMs / 4500 + index))
}

function metricHistory(index: number, timeMs: number, sample: (index: number, timeMs: number) => number | null): MetricSample[] {
  const history: MetricSample[] = []
  const id = `p${index + 1}`
  const lastSampleMs = id === `p6` ? Math.min(timeMs, 24_000) : timeMs
  for (let time = 0; time <= lastSampleMs; time += 1000) {
    history.push({ timeMs: time, value: sample(index, time), lifetimeId: lifetime(id, time) })
  }
  return history
}

function playerPaths(index: number, timeMs: number, sessionId: string): TelemetryPath[] {
  const paths: TelemetryPath[] = []
  const playerId = `p${index + 1}`
  let current: TelemetryPath | null = null
  for (let time = 0; time <= timeMs; time += 1000) {
    const position = positionAt(index, time, sessionId)
    if (!position) {
      current = null
      continue
    }
    const lifetimeId = lifetime(playerId, time)
    if (!current || current.lifetimeId !== lifetimeId) {
      current = { playerId, lifetimeId, points: [] }
      paths.push(current)
    }
    current.points.push({ timeMs: time, position })
  }
  return paths
}

function playerAt(index: number, timeMs: number, sessionId: string): TelemetryPlayer {
  const id = `p${index + 1}`
  const present = isPresent(id, timeMs)
  const position = positionAt(index, timeMs, sessionId)
  const previous = positionAt(index, Math.max(0, timeMs - 1000), sessionId)
  const identified = index < 6 || (index === 6 && timeMs >= 8000)
  const name = identified ? names[index] ?? `Corvin` : null
  const events = fixtureEvents.filter(event => event.timeMs <= timeMs)
  const health = healthAt(index, timeMs)
  return {
    id,
    name,
    playFabId: identified ? `A10C00000000000${index + 1}` : null,
    firstSeenMs: 0,
    lastSeenMs: present ? Math.floor(timeMs / 1000) * 1000 : 23_000,
    present,
    lifetimeId: lifetime(id, timeMs),
    health,
    maxHealth: maximumHealth[index],
    stamina: staminaAt(index, timeMs),
    position,
    speed: position && previous && timeMs >= 1000
      ? Math.round(Math.hypot(position.x - previous.x, position.y - previous.y, position.z - previous.z))
      : null,
    inventory: [
      { slot: `Primary`, item: id === `p1` && timeMs >= 26_000 ? `BP_PoleAxe_C` : index % 2 === 0 ? `BP_LongSword_C` : `BP_WarBow_C` },
      { slot: `Secondary`, item: `BP_ShortSword_C` },
      { slot: `Throwable`, item: id === `p2` && timeMs >= 21_000 ? null : `BP_ThrowingAxe_C` },
      { slot: `Utility`, item: null }
    ],
    healthHistory: metricHistory(index, timeMs, healthAt),
    staminaHistory: metricHistory(index, timeMs, staminaAt),
    damageDealt: events.filter(event => event.kind === `damage` && event.actorId === id).reduce((sum, event) => sum + (event.amount ?? 0), 0),
    damageTaken: events.filter(event => event.kind === `damage` && event.targetId === id).reduce((sum, event) => sum + (event.amount ?? 0), 0),
    deathCount: events.filter(event => event.kind === `death` && event.targetId === id).length,
    statuses: [
      ...(!present ? [`Disconnected`] : []),
      ...(isDead(id, timeMs) ? [`Dead`] : []),
      ...(present && !isDead(id, timeMs) && health === null ? [`Health unavailable`] : []),
      ...(present && !isDead(id, timeMs) && position === null ? [`Position unavailable`] : [])
    ]
  }
}

export function createPreviewRecordings(): TelemetrySession[] {
  return [
    { id: `preview-courtyard`, name: `Courtyard skirmish`, serverName: `The Fighting Pit`, startedAt: Date.UTC(2026, 9, 19, 19, 40), durationMs: 90_000, status: `saved` },
    { id: `preview-bridge`, name: `Bridge defence`, serverName: `SpellBook arena`, startedAt: Date.UTC(2026, 9, 19, 20, 15), durationMs: 120_000, status: `saved` }
  ]
}

export class TelemetryFixtureSource implements TelemetrySessionSource {
  getSnapshot(sessionId: string, timeMs: number): TelemetrySnapshot {
    const cursorMs = Math.max(0, Math.min(Number.isFinite(timeMs) ? timeMs : 0, 300_000))
    const sampleMs = Math.floor(cursorMs / 1000) * 1000
    return {
      timeMs: cursorMs,
      players: names.map((_, index) => playerAt(index, sampleMs, sessionId)),
      events: aggregateItemEvents(fixtureEvents.filter(event => event.timeMs <= cursorMs)),
      paths: names.flatMap((_, index) => playerPaths(index, cursorMs, sessionId))
    }
  }
}
