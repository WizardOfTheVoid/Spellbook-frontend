import type { TelemetrySnapshot } from '../session/telemetryModels'
import { hasCoordinates, type Point, type Vec3, type createProjection } from './mapProjection'

type Projection = ReturnType<typeof createProjection>

export function getMapContent(snapshot: TelemetrySnapshot) {
  const accountIds = new Set(snapshot.players.filter(player => player.observationKind === `account`).map(player => player.id))
  const present = snapshot.players.filter(player => player.present && !accountIds.has(player.id))
  const players = present.flatMap(player => hasCoordinates(player.position) ? [{ ...player, position: player.position }] : [])
  const paths = snapshot.paths.filter(path => !accountIds.has(path.playerId)).map(path => ({
    ...path,
    points: path.points.filter(point => point.timeMs <= snapshot.timeMs)
  }))
  const points = [...players.map(player => player.position), ...paths.flatMap(path => path.points.map(point => point.position))]
  return { players, paths, points: points.filter(hasCoordinates), missing: present.length - players.length }
}

export function pathCommands(points: Vec3[], projection: Projection) {
  let connected = false
  return points.map(point => {
    if (!hasCoordinates(point)) {
      connected = false
      return ``
    }
    const screen = projection.project(point)
    const command = `${connected ? `L` : `M`}${screen.x},${screen.y}`
    connected = true
    return command
  }).join(` `)
}

export function mapGrid(projection: Projection, width: number, height: number) {
  const rawStep = 80 / projection.scale
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const step = [1, 2, 5, 10].find(value => value * magnitude >= rawStep)! * magnitude
  const low = projection.inverse({ x: 0, y: height })
  const high = projection.inverse({ x: width, y: 0 })
  const lines: { axis: `x` | `y`, value: number, position: Point }[] = []
  for (const axis of [`x`, `y`] as const) {
    for (let value = Math.ceil(low[axis] / step) * step; value <= high[axis]; value += step) {
      lines.push({ axis, value, position: projection.project({ x: 0, y: 0, z: 0, [axis]: value }) })
    }
  }
  return { lines, step }
}
