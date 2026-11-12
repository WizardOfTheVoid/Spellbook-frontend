import type { Vec3 } from '../session/telemetryModels'
export type { Vec3 } from '../session/telemetryModels'
export type Point = { x: number, y: number }
export type MapCamera = { zoom: number, pan: Point }

export const hasCoordinates = (point: Vec3 | null): point is Vec3 =>
  point !== null && Number.isFinite(point.x) && Number.isFinite(point.y)

export function createProjection(
  points: Vec3[],
  width: number,
  height: number,
  zoom = 1,
  pan = { x: 0, y: 0 }
) {
  const known = points.filter(hasCoordinates)
  const xs = known.map(point => point.x)
  const ys = known.map(point => point.y)
  const minX = xs.length ? Math.min(...xs) : -1000
  const maxX = xs.length ? Math.max(...xs) : 1000
  const minY = ys.length ? Math.min(...ys) : -1000
  const maxY = ys.length ? Math.max(...ys) : 1000
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
  const scale = Math.min(
    Math.max(1, width - 80) / Math.max(100, maxX - minX),
    Math.max(1, height - 80) / Math.max(100, maxY - minY)
  ) * zoom

  return {
    scale,
    project: (point: Vec3) => ({
      x: width / 2 + (point.x - center.x) * scale + pan.x,
      y: height / 2 - (point.y - center.y) * scale + pan.y
    }),
    inverse: (point: Point): Vec3 => ({
      x: (point.x - width / 2 - pan.x) / scale + center.x,
      y: -(point.y - height / 2 - pan.y) / scale + center.y,
      z: 0
    })
  }
}

export function zoomCamera(camera: MapCamera, factor: number, anchor: Point, center: Point): MapCamera {
  const zoom = Math.max(0.1, Math.min(20, camera.zoom * factor))
  const ratio = zoom / camera.zoom
  return {
    zoom,
    pan: {
      x: anchor.x - center.x - (anchor.x - center.x - camera.pan.x) * ratio,
      y: anchor.y - center.y - (anchor.y - center.y - camera.pan.y) * ratio
    }
  }
}
