<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte'
  import Select from '$lib/components/ui/Select.svelte'
  import { formatRecordTime } from './timelineController'
  import type { TelemetryWorkspace } from '../session/telemetryModels'
  export let workspace: TelemetryWorkspace
  export let durationMs: number
  export let live: boolean
  export let recording: boolean
  export let onSeek: (timeMs: number) => void
  export let onSeekEnd: (timeMs: number) => void = onSeek
  export let onPlay: () => void
  export let onPause: () => void
  export let onGoLive: () => void
  export let onSpeed: (speed: number) => void
  $: following = workspace.mode === `live`
  $: playing = workspace.mode === `playing` || following
  const speeds = [0.25, 0.5, 1, 2, 4].map(speed => ({ value: `${speed}`, label: `${speed}×` }))
</script>

<footer class="timeline">
  <div class="timeline-controls">
    <Button label={playing ? `Pause` : `Play`} icon={playing ? `fa-pause` : `fa-play`} size="sm"
      disabled={durationMs === 0} onClick={playing ? onPause : onPlay} />
    <div class="speed"><Select ariaLabel="Playback speed" options={speeds} value={`${workspace.speed}`}
      disabled={following || durationMs === 0} tooltip={following ? `Pause or rewind to change playback speed` : null}
      onChange={value => onSpeed(Number(value))} /></div>
    <input aria-label="Recording timeline" type="range" min="0" max={Math.max(1, durationMs)} step="10"
      value={workspace.desiredCursorMs ?? workspace.cursorMs} disabled={durationMs === 0} aria-valuetext={formatRecordTime((workspace.desiredCursorMs ?? workspace.cursorMs) * 1000)}
      on:input={event => onSeek(Number(event.currentTarget.value))} on:change={event => onSeekEnd(Number(event.currentTarget.value))} />
    <span class="time"><b>{formatRecordTime(workspace.cursorMs * 1000)}</b> / {formatRecordTime(durationMs * 1000)}</span>
  </div>
  {#if live && recording && !following}
    <div class="timeline-meta">
      <span>{formatRecordTime((durationMs - workspace.cursorMs) * 1000)} behind live</span>
      <Button label="Go live" size="sm" onClick={onGoLive} />
    </div>
  {/if}
</footer>

<style>
  .timeline { border-top: 1px solid var(--color-dark-secondary); padding-top: 14px; display: grid; gap: 10px; min-width: 0; }
  .timeline-controls { display: grid; grid-template-columns: 108px 76px minmax(0, 1fr) auto; align-items: center; gap: 12px; }
  .speed { min-width: 0; }
  .speed :global(.ui-select__control) { min-height: var(--control-height-sm); }
  .time { font-variant-numeric: tabular-nums; font-size: var(--font-size-xs); color: var(--color-light-tertiary); white-space: nowrap; }
  .time b { color: var(--color-light-primary); font-weight: var(--font-weight-medium); }
  input { width: 100%; min-width: 0; margin: 0; accent-color: var(--color-accent-primary); cursor: pointer; }
  input:disabled { cursor: default; }
  input:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 4px; }
  .timeline-meta { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px; color: var(--color-light-tertiary); font-size: var(--font-size-xs); }
  @container telemetry (max-width: 479px) {
    .timeline-controls { grid-template-columns: 108px 76px minmax(0, 1fr); gap: 8px; }
    .time { grid-column: 1 / -1; justify-self: end; }
  }
</style>
