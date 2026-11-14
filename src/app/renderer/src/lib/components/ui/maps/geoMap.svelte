<script lang="ts">
  import { onMount } from 'svelte'
  import 'leaflet/dist/leaflet.css'
  import Button from '../Button.svelte'
  import InfoNotice from '../infoNotice.svelte'
  import { createGeoMapMount, type GeoMapController } from './geoMapController'
  import { createLeafletAdapter } from './geoMapLeaflet'
  import type { GeoMapMarker, GeoMapCircle, GeoMapRegion, GeoMapTileSource } from './geoMapTypes'

  export let datasetKey: string
  export let markers: readonly GeoMapMarker[]
  export let circles: readonly GeoMapCircle[] = []
  export let region: GeoMapRegion = null
  export let selectedMarkerId: string | null = null
  export let tiles: GeoMapTileSource
  export let onSelect: (id: string | null) => void
  export let popupContent: ((id: string) => HTMLElement) | undefined = undefined

  let container: HTMLDivElement
  let controller: GeoMapController | null = null
  let tileError = false
  let mapError = false

  $: controller?.update({ datasetKey, markers, circles, region, selectedMarkerId })

  onMount(() => {
    const mount = createGeoMapMount(async () => createLeafletAdapter(await import('leaflet'), container, tiles, {
      onSelect: id => onSelect(id), onTileError: () => { tileError = true }, popupContent: popupContent ? id => popupContent!(id) : undefined
    }), ready => { controller = ready }, () => { mapError = true })
    const observer = new ResizeObserver(() => controller?.resize())
    observer.observe(container)
    void mount.start()
    return () => { observer.disconnect(); mount.dispose(); controller = null }
  })
</script>

<div class="geo-map-container">
  {#if mapError || tileError}
    <div role="status">
      <InfoNotice message={mapError ? `Map could not be loaded.` : `Map background could not load. Retry.`} icon="fa-triangle-exclamation"
        tone="var(--color-danger)" onClick={!mapError && tileError ? () => { tileError = false; controller?.retryTiles() } : null} />
    </div>
  {/if}
  <div class="geo-map">
    <div class="geo-map__canvas" bind:this={container} aria-label="Server locations"></div>
    <div class="geo-map__actions"><Button label="Fit" icon="fa-expand" size="sm" onClick={() => controller?.fit()} /></div>
  </div>
</div>

<style>
  .geo-map-container { display: grid; gap: var(--gutter-sm); min-width: 0 }
  .geo-map { position: relative; min-width: 0; width: 100%; height: clamp(320px, calc(100vh - 380px), 560px); border: 1px solid var(--color-dark-tertiary); border-radius: var(--radius); overflow: hidden }
  .geo-map__canvas { height: 100%; width: 100%; background: var(--color-dark-secondary); z-index: 0 }
  .geo-map :global(.leaflet-tile-pane) { filter: invert(1) hue-rotate(180deg) brightness(0.75) saturate(0.45) contrast(1.05) }
  .geo-map :global(.leaflet-bar) { border: 1px solid var(--color-dark-tertiary); box-shadow: none }
  .geo-map :global(.leaflet-bar a) { background: var(--color-dark-secondary); color: var(--color-light-primary); border-color: var(--color-dark-tertiary) }
  .geo-map :global(.leaflet-bar a:hover), .geo-map :global(.leaflet-bar a:focus) { background: var(--color-dark-primary); color: var(--color-accent-primary) }
  .geo-map :global(.leaflet-bar a.leaflet-disabled) { color: var(--color-light-tertiary) }
  .geo-map :global(.leaflet-control-attribution) { background: var(--color-dark-primary); color: var(--color-light-secondary); font-size: 10px; padding: 0 4px }
  .geo-map :global(.leaflet-control-attribution a) { color: var(--color-light-secondary) }
  .geo-map__actions { position: absolute; top: 10px; left: 50px; z-index: 1; background: var(--color-dark-secondary); border-radius: var(--radius) }
  .geo-map :global(.geo-map__pin) { --geo-map-pin-color: #a35cff; display: grid; place-items: center; background: var(--color-dark-primary); color: var(--geo-map-pin-color); border: 2px solid var(--geo-map-pin-color); border-radius: 50%; font-weight: 700; box-shadow: 0 1px 5px #0008 }
  .geo-map :global(.geo-map__pin--muted) { --geo-map-pin-color: #8b97a3 }
  .geo-map :global(.geo-map__pin--selected) { background: var(--geo-map-pin-color); color: var(--color-dark-primary) }
  .geo-map :global(.leaflet-popup-content-wrapper), .geo-map :global(.leaflet-popup-tip), .geo-map :global(.leaflet-tooltip) { background: var(--color-dark-secondary); color: var(--color-light-primary) }
  .geo-map :global(.leaflet-popup-content) { display: grid; gap: var(--gutter-sm); max-height: 220px; overflow: auto }
  .geo-map :global(.leaflet-popup-content > div) { display: grid; gap: 2px }
  .geo-map :global(.leaflet-popup-content small) { color: var(--color-light-tertiary) }
</style>
