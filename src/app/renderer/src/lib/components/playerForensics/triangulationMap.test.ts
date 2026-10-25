import assert from 'node:assert/strict'
import test from 'node:test'
import type { TriangulationProfile } from '@spellbook/shared/forensics/triangulation'
import { createTriangulationMap, createServerLocationPopup } from './triangulationMap'

const server = (serverId: number, radius: number | null, latitude = 0, longitude = 0) => ({ serverId, serverName: `Server ${serverId}`, deleted: false,
  ping: { sampleCount: 2, medianMs: 20 }, backendPingContext: null, location: { latitude, longitude, accuracyRadiusKm: radius, source: null, checkedAt: null } }) as TriangulationProfile[`servers`][number]

test(`colocated servers share one stable marker and the largest known radius in metres`, () => {
  const servers = [server(1, null), server(2, 5), server(3, 12), server(4, null, 1, 2), { ...server(5, 2), location: null }]
  const map = createTriangulationMap({ servers } as TriangulationProfile)
  assert.equal(map.markers.length, 2)
  assert.equal(map.markers[0]!.count, 3)
  assert.deepEqual(map.serversByMarker.get(map.markers[0]!.id)!.map(server => server.serverId), [1, 2, 3])
  assert.equal(map.circles.length, 1)
  assert.equal(map.circles[0]!.radiusMeters, 12000)
  assert.equal(`markerId` in map.circles[0]! ? map.circles[0]!.markerId : null, map.markers[0]!.id)
  assert.equal(createTriangulationMap({ servers: [...servers].reverse() } as TriangulationProfile).markers.find(marker => marker.latitude === 0)!.id, map.markers[0]!.id)
})

test(`missing coordinates and invalid radii cannot fabricate map layers`, () => {
  const map = createTriangulationMap({ servers: [server(1, NaN), server(2, -10, 3, 4), server(3, 1, NaN, 0)] } as TriangulationProfile)
  assert.equal(map.markers.length, 2)
  assert.deepEqual(map.circles, [])
  assert.deepEqual(createTriangulationMap({ servers: [] } as unknown as TriangulationProfile).markers, [])
})

test(`popup nodes preserve arbitrary server names as text`, () => {
  type Node = { textContent: string, children: Node[], append(...children: Node[]): void }
  const document = { createElement: (): Node => ({ textContent: ``, children: [], append(...children: Node[]) { this.children.push(...children) } }) }
  const name = `<img src=x onerror=window.injected=true>`
  const popup = createServerLocationPopup([{ ...server(1, null), location: server(1, null).location!, visited: true, serverName: name }], document as unknown as Document) as unknown as Node
  assert.equal(popup.children[0]!.children[0]!.textContent, name)
})

test(`catalog-only servers remain background context while visited membership wins at a shared point`, () => {
  const visited = server(1, 5)
  const map = createTriangulationMap({ servers: [visited], map: { servers: [server(2, 10), visited, server(3, null, 30, 40)], truncated: false } } as unknown as TriangulationProfile)
  assert.equal(map.markers.length, 2)
  assert.equal(map.markers[0]!.tone, `accent`)
  assert.equal(map.markers[0]!.count, 1)
  assert.deepEqual(map.serversByMarker.get(map.markers[0]!.id)!.map(server => [server.serverId, server.visited]), [[1, true], [2, false]])
  assert.equal(map.markers[1]!.tone, `muted`)
  assert.equal(map.markers[1]!.fit, false)
})

test(`an available radius is independent of server markers and becomes the fit focus`, () => {
  const region = { type: `Feature`, properties: {}, geometry: { type: `MultiPolygon`, coordinates: [] } }
  const map = createTriangulationMap({ servers: [server(1, 5)], estimate: { status: `regionAvailable`, circle: { latitude: 5, longitude: 6, radiusKm: 123 }, region } } as unknown as TriangulationProfile)
  assert.equal(map.markers.length, 1)
  assert.equal(map.markers[0]!.fit, false)
  const circle = map.circles.find(circle => circle.kind === `regionExtent`)!
  assert.equal(circle.radiusMeters, 123000)
  assert.equal(`markerId` in circle, false)
  assert.equal(map.region, region)
})
