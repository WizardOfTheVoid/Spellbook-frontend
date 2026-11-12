import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TelemetryPlayer, TelemetrySnapshot } from '../session/telemetryModels'
import { getMapContent, mapGrid, pathCommands } from './mapGeometry'
import { createProjection } from './mapProjection'

const position = (x: number, y = 0) => ({ x, y, z: 0 })
const player = (id: string, overrides: Partial<TelemetryPlayer> = {}): TelemetryPlayer => ({
  id, name: null, playFabId: null, firstSeenMs: 0, lastSeenMs: 100, present: true,
  lifetimeId: `${id}:1`, health: null, maxHealth: null, stamina: null, position: null,
  speed: null, inventory: [], healthHistory: [], staminaHistory: [],
  damageDealt: 0, damageTaken: 0, deathCount: 0, statuses: [], ...overrides
})

test(`map includes only present players with known XY coordinates`, () => {
  const snapshot: TelemetrySnapshot = {
    timeMs: 100, events: [], paths: [],
    players: [
      player(`known`, { position: position(20) }),
      player(`unknown`),
      player(`invalid`, { position: position(NaN) }),
      player(`left`, { present: false, position: position(10) })
    ]
  }
  const content = getMapContent(snapshot)
  assert.deepEqual(content.players.map(value => value.id), [`known`])
  assert.deepEqual(content.points, [position(20)])
  assert.equal(content.missing, 2)
})

test(`map preserves trajectory lifetimes and excludes positions after the cursor`, () => {
  const content = getMapContent({
    timeMs: 100, players: [], events: [],
    paths: [
      { playerId: `a`, lifetimeId: `a:1`, points: [{ timeMs: 10, position: position(10) }, { timeMs: 50, position: position(20) }] },
      { playerId: `a`, lifetimeId: `a:2`, points: [{ timeMs: 90, position: position(500) }, { timeMs: 110, position: position(600) }] }
    ]
  })
  assert.deepEqual(content.paths.map(path => [path.lifetimeId, path.points.map(point => point.position.x)]), [
    [`a:1`, [10, 20]], [`a:2`, [500]]
  ])
  assert.deepEqual(content.points.map(point => point.x), [10, 20, 500])
})

test(`unknown trajectory positions break lines instead of connecting across the gap`, () => {
  const projection = createProjection([position(-100, -100), position(100, 100)], 280, 280)
  const commands = pathCommands([position(0), position(10), position(NaN), position(50), position(60)], projection)
  assert.equal(commands, `M140,140 L150,140  M190,140 L200,140`)
})

test(`grid uses equal world spacing on both axes while panning and zooming`, () => {
  const projection = createProjection([position(-100, -100), position(100, 100)], 280, 280, 2, { x: 20, y: -20 })
  const grid = mapGrid(projection, 280, 280)
  assert.equal(grid.step, 50)
  const horizontal = grid.lines.filter(line => line.axis === `x`)
  const vertical = grid.lines.filter(line => line.axis === `y`)
  assert.equal(horizontal[1].position.x - horizontal[0].position.x, 100)
  assert.equal(vertical[0].position.y - vertical[1].position.y, 100)
  assert.ok(grid.lines.every(line => line.axis === `x`
    ? line.position.x >= 0 && line.position.x <= 280
    : line.position.y >= 0 && line.position.y <= 280))
})
