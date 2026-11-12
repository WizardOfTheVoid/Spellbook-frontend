import assert from 'node:assert/strict'
import test from 'node:test'
import { isMapCoordinate, mapLongitudeBounds, geoMapBounds } from './geoMapGeometry'

test(`validates complete finite geographic coordinates including zero`, () => {
  assert.equal(isMapCoordinate(0, 0), true)
  for (const [lat, lon] of [[null, 0], [0, undefined], [91, 0], [0, -181], [NaN, 0], [`1`, 0]]) assert.equal(isMapCoordinate(lat, lon), false)
})

test(`fits the shortest wrapped interval across the antimeridian`, () => {
  assert.equal(mapLongitudeBounds([]), null)
  assert.deepEqual(mapLongitudeBounds([10, 20, 10]), { west: 10, east: 20 })
  assert.deepEqual(mapLongitudeBounds([179, -179]), { west: 179, east: 181 })
  const bounds = geoMapBounds([{ id: `a`, label: `A`, latitude: 0, longitude: 179 }, { id: `b`, label: `B`, latitude: 0, longitude: -179 }], [], null)!
  assert.equal(bounds.east - bounds.west, 2)
})

test(`circle extents participate in fitting without inventing an unknown radius`, () => {
  const markers = [{ id: `a`, label: `A`, latitude: 0, longitude: 0 }]
  const bounds = geoMapBounds(markers, [{ id: `r`, markerId: `a`, radiusMeters: 111195, kind: `locationUncertainty` }], null)!
  assert.ok(bounds.north > 0.99 && bounds.north < 1.01)
  assert.equal(geoMapBounds([], [], null), null)
})

test(`explicit geographic circles fit without a player marker and background context does not enlarge the view`, () => {
  const markers = [{ id: `background`, label: `Other`, latitude: -60, longitude: 120, fit: false }]
  const circle = { id: `estimate`, latitude: 10, longitude: 0, radiusMeters: 100000, kind: `regionExtent` as const }
  const bounds = geoMapBounds(markers, [circle], null)!
  assert.ok(bounds.north < 12 && bounds.south > 8)
  assert.ok(bounds.east - bounds.west < 3)
  assert.equal(geoMapBounds(markers, [], null), null)
})
