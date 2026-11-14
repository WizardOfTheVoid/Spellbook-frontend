import type { GeoMapData, GeoMapLayers } from './geoMapTypes'

export type GeoMapAdapter = {
  initialize(): void
  replaceLayers(layers: GeoMapLayers): void
  selectMarker(id: string | null): void
  fitToLayers(): void
  invalidateSize(): void
  retryTiles(): void
  remove(): void
}

export function createGeoMapController(adapter: GeoMapAdapter) {
  let current: GeoMapData | null = null
  let disposed = false
  return {
    update(next: GeoMapData): void {
      if (disposed) return
      if (!current) adapter.initialize()
      const newDataset = current?.datasetKey !== next.datasetKey
      const layersChanged = newDataset || current?.markers !== next.markers || current?.circles !== next.circles || current?.region !== next.region
      if (layersChanged) adapter.replaceLayers(next)
      if (newDataset) adapter.fitToLayers()
      if (layersChanged || current?.selectedMarkerId !== next.selectedMarkerId) adapter.selectMarker(next.selectedMarkerId)
      current = next
    },
    fit(): void { if (!disposed && current) adapter.fitToLayers() },
    resize(): void { if (!disposed && current) adapter.invalidateSize() },
    retryTiles(): void { if (!disposed && current) adapter.retryTiles() },
    dispose(): void {
      if (disposed) return
      disposed = true
      if (current) adapter.remove()
      current = null
    }
  }
}

export type GeoMapController = ReturnType<typeof createGeoMapController>

export function createGeoMapMount(load: () => Promise<GeoMapAdapter>, ready: (controller: GeoMapController) => void, failed: (error: unknown) => void) {
  let disposed = false
  let started = false
  let controller: GeoMapController | null = null
  return {
    async start(): Promise<void> {
      if (started || disposed) return
      started = true
      try {
        const adapter = await load()
        if (disposed) return
        controller = createGeoMapController(adapter)
        ready(controller)
      } catch (error) { if (!disposed) failed(error) }
    },
    dispose(): void { disposed = true; controller?.dispose() }
  }
}
