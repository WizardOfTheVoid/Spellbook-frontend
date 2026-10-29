import type * as Leaflet from 'leaflet'
import type { GeoMapAdapter } from './geoMapController'
import type { GeoMapLayers, GeoMapTileSource } from './geoMapTypes'
import { circleCenter, geoMapBounds, isMapCoordinate, longitudeNear, regionNear } from './geoMapGeometry'

export function createLeafletAdapter(L: typeof Leaflet, container: HTMLElement, tiles: GeoMapTileSource, options: {
  onSelect(id: string | null): void
  onTileError(): void
  popupContent?: (id: string) => HTMLElement
}): GeoMapAdapter {
  let map: Leaflet.Map
  let tileLayer: Leaflet.TileLayer
  let pinLayer: Leaflet.LayerGroup
  let uncertaintyLayer: Leaflet.LayerGroup
  let constraintLayer: Leaflet.LayerGroup
  let regionLayer: Leaflet.LayerGroup
  let layers: GeoMapLayers = { markers: [], circles: [], region: null }
  const pins = new Map<string, Leaflet.Marker>()
  const node = (text: string) => { const element = container.ownerDocument.createElement(`span`); element.textContent = text; return element }

  return {
    initialize(): void {
      map = L.map(container, { attributionControl: false, scrollWheelZoom: false })
      const attribution = container.ownerDocument.createElement(`a`)
      attribution.href = tiles.attributionUrl
      attribution.textContent = tiles.attributionText
      attribution.target = `_blank`
      attribution.rel = `noopener noreferrer`
      L.control.attribution({ prefix: false }).addTo(map).addAttribution(attribution.outerHTML)
      tileLayer = L.tileLayer(tiles.urlTemplate, { maxZoom: 19 }).on(`tileerror`, options.onTileError).addTo(map)
      pinLayer = L.layerGroup().addTo(map)
      uncertaintyLayer = L.layerGroup().addTo(map)
      constraintLayer = L.layerGroup().addTo(map)
      regionLayer = L.layerGroup().addTo(map)
      map.on(`click`, () => options.onSelect(null))
    },
    replaceLayers(next): void {
      layers = next
      for (const group of [pinLayer, uncertaintyLayer, constraintLayer, regionLayer]) group.clearLayers()
      pins.clear()
      const bounds = geoMapBounds(next.markers, next.circles, next.region)
      const west = bounds ? (bounds.west + bounds.east) / 2 - 180 : -180
      const markers = new Map(next.markers.filter(marker => isMapCoordinate(marker.latitude, marker.longitude)).map(marker => [marker.id, marker]))
      for (const marker of markers.values()) {
        const pin = L.marker([marker.latitude, longitudeNear(marker.longitude, west)], {
          title: marker.label,
          icon: L.divIcon({ className: `geo-map__pin geo-map__pin--${marker.tone ?? `accent`}`, html: node(marker.count && marker.count > 1 ? String(marker.count) : `•`), iconSize: [28, 28], iconAnchor: [14, 14] })
        }).bindTooltip(node(marker.label)).bindPopup(() => options.popupContent?.(marker.id) ?? node(marker.label), { autoPan: false })
        pin.on(`click`, () => options.onSelect(marker.id))
        pin.addTo(pinLayer)
        pins.set(marker.id, pin)
      }
      for (const circle of next.circles) {
        const marker = circleCenter(circle, markers)
        if (!marker || !Number.isFinite(circle.radiusMeters) || circle.radiusMeters < 0) continue
        const uncertainty = circle.kind === `locationUncertainty`
        L.circle([marker.latitude, longitudeNear(marker.longitude, west)], {
          radius: circle.radiusMeters, color: uncertainty ? `#a35cff` : `#32f59b`, weight: circle.kind === `regionExtent` ? 2 : 1, fillOpacity: 0.06, interactive: false
        }).addTo(uncertainty ? uncertaintyLayer : constraintLayer)
      }
      if (next.region) L.geoJSON(regionNear(next.region, west), {
        style: { color: `#32f59b`, weight: 0, fillOpacity: 0.15 }, interactive: false
      }).addTo(regionLayer)
    },
    selectMarker(id): void {
      for (const [markerId, pin] of pins) {
        const selected = markerId === id
        pin.getElement()?.classList.toggle(`geo-map__pin--selected`, selected)
        if (!selected) pin.closePopup()
      }
      if (id) pins.get(id)?.openPopup()
    },
    fitToLayers(): void {
      const bounds = geoMapBounds(layers.markers, layers.circles, layers.region)
      if (bounds) map.fitBounds([[bounds.south, bounds.west], [bounds.north, bounds.east]], { padding: [28, 28], maxZoom: 10, animate: false })
    },
    invalidateSize(): void { map.invalidateSize({ pan: false }) },
    retryTiles(): void { tileLayer.redraw() },
    remove(): void { tileLayer.off(); map.off(); map.remove(); pins.clear() }
  }
}
