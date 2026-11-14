import type { Feature, MultiPolygon, Polygon } from 'geojson'

export type GeoMapMarker = { id: string, latitude: number, longitude: number, label: string, count?: number, tone?: `accent` | `muted`, fit?: boolean }
export type GeoMapCircle = { id: string, radiusMeters: number, kind: `locationUncertainty` | `latencyConstraint` | `regionExtent`, fit?: boolean }
  & ({ markerId: string } | { latitude: number, longitude: number })
export type GeoMapRegion = Feature<Polygon | MultiPolygon> | null
export type GeoMapTileSource = { urlTemplate: string, attributionText: string, attributionUrl: string }
export type GeoMapLayers = { markers: readonly GeoMapMarker[], circles: readonly GeoMapCircle[], region: GeoMapRegion }
export type GeoMapData = GeoMapLayers & { datasetKey: string, selectedMarkerId: string | null }
