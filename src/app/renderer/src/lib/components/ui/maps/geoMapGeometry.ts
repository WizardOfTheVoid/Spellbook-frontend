import type { GeoMapCircle, GeoMapMarker, GeoMapRegion } from './geoMapTypes'

const earthRadiusMeters = 6371000
const radians = Math.PI / 180
const latitudeLimit = 85.051129

export function isMapCoordinate(latitude: unknown, longitude: unknown): boolean {
  return typeof latitude === `number` && Number.isFinite(latitude) && Math.abs(latitude) <= 90
    && typeof longitude === `number` && Number.isFinite(longitude) && Math.abs(longitude) <= 180
}

export function mapLongitudeBounds(longitudes: readonly number[]): { west: number, east: number } | null {
  const values = [...new Set(longitudes.filter(Number.isFinite).map(value => ((value % 360) + 360) % 360))].sort((a, b) => a - b)
  if (!values.length) return null
  let gap = -1
  let start = values[0]!
  for (let index = 0; index < values.length; index++) {
    const next = values[(index + 1) % values.length]!
    const distance = (index === values.length - 1 ? next + 360 : next) - values[index]!
    if (distance > gap) { gap = distance; start = next }
  }
  const west = start > 180 ? start - 360 : start
  return { west, east: west + 360 - gap }
}

export function longitudeNear(longitude: number, west: number): number {
  return west + ((longitude - west) % 360 + 360) % 360
}

export function regionNear(region: NonNullable<GeoMapRegion>, west: number): NonNullable<GeoMapRegion> {
  const move = (polygon: number[][][]) => {
    const longitudes = polygon[0]?.map(position => position[0]!) ?? []
    const center = longitudes.length ? (Math.min(...longitudes) + Math.max(...longitudes)) / 2 : 0
    const offset = longitudeNear(center, west) - center
    return polygon.map(ring => ring.map(([longitude, ...position]) => [longitude! + offset, ...position]))
  }
  const geometry = region.geometry
  return { ...region, geometry: geometry.type === `Polygon` ? { ...geometry, coordinates: move(geometry.coordinates) }
    : { ...geometry, coordinates: geometry.coordinates.map(move) } }
}

export function circleCenter(circle: GeoMapCircle, markers: ReadonlyMap<string, GeoMapMarker>) {
  const center = `markerId` in circle ? markers.get(circle.markerId) : circle
  return center && isMapCoordinate(center.latitude, center.longitude) ? { latitude: center.latitude, longitude: center.longitude } : null
}

export function geoMapBounds(markers: readonly GeoMapMarker[], circles: readonly GeoMapCircle[], region: GeoMapRegion) {
  const latitudes: number[] = []
  const longitudes: number[] = []
  let fullLongitude = false
  const add = (latitude: number, longitude: number) => {
    if (!isMapCoordinate(latitude, longitude)) return
    latitudes.push(latitude)
    longitudes.push(longitude)
  }
  const validMarkers = markers.filter(marker => isMapCoordinate(marker.latitude, marker.longitude))
  const byId = new Map(validMarkers.map(marker => [marker.id, marker]))
  for (const marker of validMarkers) if (marker.fit !== false) add(marker.latitude, marker.longitude)
  for (const circle of circles) {
    if (circle.fit === false) continue
    const marker = circleCenter(circle, byId)
    if (!marker || !Number.isFinite(circle.radiusMeters) || circle.radiusMeters < 0) continue
    add(marker.latitude, marker.longitude)
    const angle = Math.min(Math.PI, circle.radiusMeters / earthRadiusMeters)
    const latitudeDelta = angle / radians
    latitudes.push(Math.max(-90, marker.latitude - latitudeDelta), Math.min(90, marker.latitude + latitudeDelta))
    if (Math.abs(marker.latitude) + latitudeDelta >= 90) { fullLongitude = true; continue }
    const longitudeDelta = Math.asin(Math.min(1, Math.sin(angle) / Math.cos(marker.latitude * radians))) / radians
    longitudes.push(marker.longitude - longitudeDelta, marker.longitude + longitudeDelta)
  }
  if (region) {
    const polygons = region.geometry.type === `Polygon` ? [region.geometry.coordinates] : region.geometry.coordinates
    for (const polygon of polygons) for (const ring of polygon) for (const position of ring) add(position[1]!, position[0]!)
  }
  if (!latitudes.length) return null
  const longitude = fullLongitude ? { west: -180, east: 180 } : mapLongitudeBounds(longitudes)!
  const clampLatitude = (value: number) => Math.max(-latitudeLimit, Math.min(latitudeLimit, value))
  return { south: clampLatitude(Math.min(...latitudes)), north: clampLatitude(Math.max(...latitudes)), ...longitude }
}
