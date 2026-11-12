<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte'
  import IconButton from '$lib/components/ui/IconButton.svelte'
  import Tag from '$lib/components/ui/Tag.svelte'
  import type { TelemetrySnapshot } from '../session/telemetryModels'
  import { playerLabel } from '../preview/telemetrySelectors'
  import { getMapContent, mapGrid, pathCommands } from './mapGeometry'
  import { createProjection, zoomCamera, type MapCamera, type Point, type Vec3 } from './mapProjection'

  let { snapshot, selectedPlayerId, onSelectPlayer }: {
    snapshot: TelemetrySnapshot
    selectedPlayerId: string | null
    onSelectPlayer: (id: string) => void
  } = $props()

  let host = $state<HTMLDivElement>()
  let width = $state(800)
  let height = $state(420)
  let camera = $state<MapCamera>({ zoom: 1, pan: { x: 0, y: 0 } })
  let fitPoints = $state.raw<Vec3[] | null>(null)
  let drag = $state<{ id: number, x: number, y: number } | null>(null)
  const content = $derived(getMapContent(snapshot))
  const projection = $derived(createProjection(fitPoints ?? content.points, width, height, camera.zoom, camera.pan))
  const grid = $derived(mapGrid(projection, width, height))
  const selected = $derived(snapshot.players.find(player => player.id === selectedPlayerId))
  const paths = $derived([...content.paths].sort((a, b) => Number(a.playerId === selectedPlayerId) - Number(b.playerId === selectedPlayerId)))

  $effect(() => {
    if (fitPoints === null && content.points.length) fitPoints = content.points
  })

  function fit() {
    fitPoints = content.points.length ? content.points : null
    camera = { zoom: 1, pan: { x: 0, y: 0 } }
  }

  function zoom(factor: number, anchor: Point = { x: width / 2, y: height / 2 }) {
    camera = zoomCamera(camera, factor, anchor, { x: width / 2, y: height / 2 })
  }

  function wheel(event: WheelEvent) {
    event.preventDefault()
    const rect = host!.getBoundingClientRect()
    zoom(Math.exp(-event.deltaY / 600), { x: event.clientX - rect.left, y: event.clientY - rect.top })
  }

  function wheelListener(node: HTMLDivElement) {
    node.addEventListener(`wheel`, wheel, { passive: false })
    return { destroy: () => node.removeEventListener(`wheel`, wheel) }
  }

  function startDrag(event: PointerEvent) {
    if (event.button !== 0 || !host) return
    host.focus({ preventScroll: true })
    host.setPointerCapture(event.pointerId)
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY }
  }

  function moveDrag(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.id) return
    camera = {
      ...camera,
      pan: { x: camera.pan.x + event.clientX - drag.x, y: camera.pan.y + event.clientY - drag.y }
    }
    drag = { ...drag, x: event.clientX, y: event.clientY }
  }

  function stopDrag(event: PointerEvent) {
    if (drag?.id !== event.pointerId) return
    if (host?.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId)
    drag = null
  }

  function keyboard(event: KeyboardEvent) {
    if (event.target !== event.currentTarget) return
    const movement: Record<string, Point> = {
      ArrowLeft: { x: 40, y: 0 }, ArrowRight: { x: -40, y: 0 },
      ArrowUp: { x: 0, y: 40 }, ArrowDown: { x: 0, y: -40 }
    }
    if (movement[event.key]) {
      const delta = movement[event.key]
      camera = { ...camera, pan: { x: camera.pan.x + delta.x, y: camera.pan.y + delta.y } }
    } else if (event.key === `+` || event.key === `=`) zoom(1.25)
    else if (event.key === `-`) zoom(0.8)
    else if (event.key === `Home`) fit()
    else return
    event.preventDefault()
  }
</script>

<section class="map-card" aria-label="Player map">
  <header>
    <div class="heading">
      <strong>World coordinates</strong>
      <Tag label={`${content.players.length} positioned`} compact />
    </div>
    <div class="controls">
      <IconButton icon="fa-minus" ariaLabel="Zoom out" size="sm" disabled={camera.zoom <= 0.1} onClick={() => zoom(0.8)} />
      <span class="zoom">{Math.round(camera.zoom * 100)}%</span>
      <IconButton icon="fa-plus" ariaLabel="Zoom in" size="sm" disabled={camera.zoom >= 20} onClick={() => zoom(1.25)} />
      <Button label="Fit view" icon="fa-expand" size="sm" onClick={fit} />
    </div>
  </header>

  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (The map supports keyboard navigation and pointer gestures.) -->
  <div
    class="viewport"
    class:dragging={drag !== null}
    bind:this={host}
    bind:clientWidth={width}
    bind:clientHeight={height}
    role="application"
    aria-label="World XY map. Arrow keys pan, plus and minus zoom, Home fits all positions."
    tabindex="0"
    use:wheelListener
    onpointerdown={startDrag}
    onpointermove={moveDrag}
    onpointerup={stopDrag}
    onpointercancel={stopDrag}
    onlostpointercapture={() => drag = null}
    onkeydown={keyboard}
  >
    <svg {width} {height} aria-hidden="true">
      {#each grid.lines as line}
        {#if line.axis === `x`}
          <line class:origin={line.value === 0} x1={line.position.x} y1="0" x2={line.position.x} y2={height} />
          <text x={line.position.x + 5} y={height - 10}>{line.value.toLocaleString()}</text>
        {:else}
          <line class:origin={line.value === 0} x1="0" y1={line.position.y} x2={width} y2={line.position.y} />
          <text x="10" y={line.position.y - 6}>{line.value.toLocaleString()}</text>
        {/if}
      {/each}
      {#each paths as path}
        <path
          d={pathCommands(path.points.map(point => point.position), projection)}
          class="trajectory"
          class:selected={path.playerId === selectedPlayerId}
          class:muted={selectedPlayerId !== null && path.playerId !== selectedPlayerId}
        />
      {/each}
    </svg>

    {#each content.players as player (player.id)}
      {@const point = projection.project(player.position)}
      {#if point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height}
        <button
          class="marker"
          class:selected={player.id === selectedPlayerId}
          class:muted={selectedPlayerId !== null && player.id !== selectedPlayerId}
          type="button"
          style:left={`${point.x}px`}
          style:top={`${point.y}px`}
          aria-label={`Select ${playerLabel(player)}`}
          aria-pressed={player.id === selectedPlayerId}
          title={`${playerLabel(player)} · X ${Math.round(player.position.x)} · Y ${Math.round(player.position.y)}`}
          onpointerdown={event => event.stopPropagation()}
          onclick={() => onSelectPlayer(player.id)}
        ><span class="dot"></span><span class="name">{playerLabel(player)}</span></button>
      {/if}
    {/each}

    {#if content.points.length === 0}
      <div class="empty">No coordinates observed at this time.</div>
    {/if}
    <span class="axis">Y ↑ · X →</span>
  </div>

  <footer>
    <div>
      <span>{selected ? `${playerLabel(selected)} · highlighted trajectory` : `Select a player to highlight their trajectory`}</span>
      {#if content.missing}<span>{content.missing} {content.missing === 1 ? `player has` : `players have`} no coordinates at this time.</span>{/if}
      {#if snapshot.omittedMapPlayers}<span>Trails show up to 64 players, prioritizing the selection and active players. {snapshot.omittedMapPlayers} omitted.</span>{/if}
    </div>
    <span>Grid {grid.step.toLocaleString()} units · Drag to pan · Scroll to zoom</span>
  </footer>
</section>

<style lang="scss">
  .map-card { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; height: 100%; min-width: 0; min-height: 0; overflow: hidden; user-select: none; border: 1px solid var(--color-dark-secondary); border-radius: var(--radius); background: rgbaa(var(--color-dark-primary), 0.34); }
  header, footer { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--gutter-sm); padding: var(--gutter-md); }
  header { border-bottom: 1px solid var(--color-dark-secondary); }
  .heading, .controls { display: flex; align-items: center; gap: var(--gutter-sm); }
  strong { font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); }
  .zoom { width: 42px; text-align: center; color: var(--color-light-secondary); font-size: var(--font-size-xs); font-variant-numeric: tabular-nums; }
  .viewport { position: relative; min-width: 0; min-height: 0; overflow: hidden; cursor: grab; touch-action: none; outline-offset: -3px; }
  .viewport.dragging { cursor: grabbing; }
  svg { display: block; pointer-events: none; }
  line { stroke: var(--color-dark-secondary); stroke-width: 1; }
  line.origin { stroke: var(--color-dark-tertiary); }
  text { fill: var(--color-light-tertiary); font-size: 10px; font-variant-numeric: tabular-nums; }
  .trajectory { fill: none; stroke: var(--color-chart-2); stroke-width: 1.5; stroke-linejoin: round; stroke-linecap: round; opacity: 0.55; }
  .trajectory.selected { stroke: var(--color-accent-primary); stroke-width: 2.5; opacity: 1; }
  .trajectory.muted { opacity: 0.2; }
  .marker { position: absolute; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; transform: translate(-50%, -50%); border: 0; border-radius: 50%; background: transparent; color: var(--color-light-secondary); cursor: pointer; }
  .dot { width: 9px; height: 9px; flex: 0 0 auto; border: 2px solid var(--color-dark-primary); border-radius: 50%; background: var(--color-chart-2); box-shadow: 0 0 0 1px var(--color-chart-2); }
  .name { position: absolute; left: 26px; max-width: 150px; padding: 3px 5px; border-radius: var(--radius); background: rgbaa(var(--color-dark-primary), 0.8); font-size: var(--font-size-xs); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
  .marker.selected { z-index: 2; color: var(--color-light-primary); }
  .marker.selected .dot { width: 12px; height: 12px; background: var(--color-accent-primary); box-shadow: 0 0 0 2px var(--color-accent-primary); }
  .marker.muted { opacity: 0.45; }
  .marker:is(:hover, :focus-visible) { z-index: 3; opacity: 1; }
  .marker:is(:hover, :focus-visible) .name { color: var(--color-light-primary); }
  .empty { position: absolute; inset: 0; display: grid; place-items: center; color: var(--color-light-tertiary); font-size: var(--font-size-sm); pointer-events: none; }
  .axis { position: absolute; top: 12px; right: 12px; color: var(--color-light-tertiary); font-size: var(--font-size-xs); pointer-events: none; }
  footer { align-items: flex-start; color: var(--color-light-tertiary); font-size: var(--font-size-xs); border-top: 1px solid var(--color-dark-secondary); }
  footer div { display: grid; gap: 4px; }
  footer div span:first-child { color: var(--color-light-secondary); }
  @container telemetry (max-width: 759px) {
    header { align-items: flex-start; padding: var(--gutter-sm) var(--gutter-md); }
    .heading, .controls { flex-wrap: wrap; }
    .controls { row-gap: 4px; }
    .name { max-width: 100px; }
    footer { gap: 4px; padding: var(--gutter-sm) var(--gutter-md); }
    footer div { gap: 2px; min-width: 0; overflow-wrap: anywhere; }
  }
</style>
