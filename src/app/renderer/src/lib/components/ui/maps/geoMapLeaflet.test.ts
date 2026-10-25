import assert from 'node:assert/strict'
import test from 'node:test'
import type * as Leaflet from 'leaflet'
import type { GeoMapRegion } from './geoMapTypes'
import { createLeafletAdapter } from './geoMapLeaflet'

test(`polar region cells preserve their seam endpoints and remain narrow in the rendered world`, () => {
  let rendered: number[][][][] = []
  const layer = { addTo() { return this }, on() { return this }, clearLayers() {} }
  const library = {
    map: () => ({ on() {} }), tileLayer: () => layer, layerGroup: () => layer, circle: () => layer,
    control: { attribution: () => ({ addTo() { return this }, addAttribution() {} }) },
    latLng: (lat: number, lng: number) => ({ lat, lng }),
    geoJSON: (region: NonNullable<GeoMapRegion>, options: { coordsToLatLng?: (position: number[]) => { lat: number, lng: number } }) => {
      const polygons = region.geometry.type === `Polygon` ? [region.geometry.coordinates] : region.geometry.coordinates
      rendered = polygons.map(polygon => polygon.map(ring => ring.map(position => {
        const point = options.coordsToLatLng?.(position) ?? { lat: position[1]!, lng: position[0]! }
        return [point.lng, point.lat]
      })))
      return layer
    }
  } as unknown as typeof Leaflet
  const container = { ownerDocument: { createElement: () => ({ outerHTML: `` }) } } as unknown as HTMLElement
  const adapter = createLeafletAdapter(library, container, { urlTemplate: ``, attributionUrl: ``, attributionText: `` }, { onSelect() {}, onTileError() {} })
  adapter.initialize()
  const region: NonNullable<GeoMapRegion> = { type: `Feature`, properties: {}, geometry: { type: `MultiPolygon`, coordinates: [
    [[[157.5, 80], [180, 80], [180, 85], [157.5, 85], [157.5, 80]]],
    [[[-180, 80], [-157.5, 80], [-157.5, 85], [-180, 85], [-180, 80]]]
  ] } }
  adapter.replaceLayers({ markers: [], circles: [{ id: `polar`, latitude: 89, longitude: 0, radiusMeters: 300000, kind: `regionExtent` }], region })
  assert.deepEqual(rendered, region.geometry.coordinates)
  for (const [ring] of rendered) assert.equal(Math.max(...ring!.map(position => position[0]!)) - Math.min(...ring!.map(position => position[0]!)), 22.5)
  adapter.replaceLayers({ markers: [], circles: [{ id: `date-line`, latitude: 82, longitude: 180, radiusMeters: 100000, kind: `regionExtent` }], region })
  assert.deepEqual(rendered[0], region.geometry.coordinates[0])
  assert.deepEqual(rendered[1], [[ [180, 80], [202.5, 80], [202.5, 85], [180, 85], [180, 80] ]])
})
