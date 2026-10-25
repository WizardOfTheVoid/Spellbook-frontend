import type { GeoMapTileSource } from '../components/ui/maps/geoMapTypes'

export const openStreetMapTiles: GeoMapTileSource = {
  urlTemplate: `https://tile.openstreetmap.org/{z}/{x}/{y}.png`,
  attributionText: `OpenStreetMap contributors`,
  attributionUrl: `https://www.openstreetmap.org/copyright`
}
