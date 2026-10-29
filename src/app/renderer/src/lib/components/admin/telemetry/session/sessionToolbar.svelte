<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte'
  import IconButton from '$lib/components/ui/IconButton.svelte'
  import Tag from '$lib/components/ui/Tag.svelte'
  import Input from '$lib/components/ui/Input.svelte'
  import type { TelemetrySession } from './telemetryModels'
  import { formatRecordTime } from '../timeline/timelineController'
  import { parseTelemetryEndpoint } from './telemetryEndpoint'
  import TelemetryServerPicker from './telemetryServerPicker.svelte'
  import type { TelemetryServerTarget } from './telemetryServerSelection'
  export let session: TelemetrySession | null
  export let recording: boolean
  export let live: boolean
  export let elapsedMs: number
  export let onRecord: () => void
  export let onStop: () => void
  export let onClose: () => void
  export let endpoint = ``
  export let currentServerName: string | null = null
  export let currentServerAddress: string | null = null
  export let busy = false
  export let captureAvailable = false
  export let captureReason: string | null = null
  export let endpointOverride = false
  export let selectedServer: TelemetryServerTarget | null = null
  export let onSelectServer: (server: TelemetryServerTarget) => void
  export let onEndpoint: (value: string) => void
  export let onCurrentServer: () => void
  export let onReprocess: () => void
  let details = false
  let choosingServer = false
  $: preparing = live && !recording
  $: validEndpoint = parseTelemetryEndpoint(endpoint)
  $: current = !endpointOverride && validEndpoint && endpoint === currentServerAddress?.trim()
  $: targetName = selectedServer?.name ?? (endpointOverride ? `Custom server` : current ? currentServerName ?? `Current game server`
    : validEndpoint ? `Last detected server` : `Choose a server to record`)
</script>

<div class="toolbar">
  <div class="session-copy">
    <strong>{preparing ? targetName : session?.serverName ?? `Server telemetry`}</strong>
    <span>{preparing ? validEndpoint ? endpoint : `Choose before joining, or join a server to detect it automatically.` : session?.name ?? `Record a game server`}</span>
  </div>
  <div class="controls">
    <Tag compact label={preparing && busy ? `Starting capture…` : session?.captureState ?? (session ? live && recording ? `Recording` : `Saved replay` : `Ready`)} />
    {#if preparing}<Button label="Choose server" size="sm" disabled={busy} onClick={() => choosingServer = !choosingServer} />{/if}
    {#if live}
      {#if recording}<Button label="Stop & save" icon="fa-stop" size="sm" disabled={busy} onClick={onStop} />
      {:else}<Button label="Record" icon="fa-circle" size="sm" variant="primary" disabled={busy || !captureAvailable || !validEndpoint} onClick={onRecord} />{/if}
    {:else}<Button label="Library" icon="fa-arrow-left" size="sm" onClick={onClose} />{/if}
    <IconButton icon="fa-circle-info" ariaLabel="Session details" tooltip="Session details" size="sm"
      expanded={details} active={details} hasPopup={null} onClick={() => details = !details} />
  </div>
</div>
{#if preparing && choosingServer && !busy}
  <TelemetryServerPicker onSelect={server => {
    onSelectServer(server)
    choosingServer = false
  }} />
{/if}
{#if live && session?.captureState === `recording`}
  <p class="capture-reason">Capture active. Join or rejoin this server to include its initial observations.</p>
{/if}
{#if preparing && !captureAvailable}
  <p class="capture-reason">{captureReason ?? `Checking capture availability…`}</p>
{/if}
{#if details}
  {#if preparing}
    <div class="endpoint">
      <Input label="Server address override" placeholder="IPv4 address:game port" value={endpoint} onChange={onEndpoint} disabled={busy}
        hint="Automatically follows your current server until you enter an override." />
      {#if endpointOverride}<Button label="Use current server" size="sm" disabled={busy} onClick={onCurrentServer} />{/if}
    </div>
  {/if}
  <div class="session-details">
    {#if session}<span>Started {new Date(session.startedAt).toLocaleString()}</span><span>Duration {formatRecordTime(elapsedMs * 1000)}</span>{/if}
    {#if session?.decoderVersion}<span>Decoder {session.decoderVersion}</span>{/if}
    {#if session && !recording}<Button label="Reprocess" size="sm" disabled={busy} onClick={onReprocess} />{/if}
  </div>
{/if}

<style>
  .toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; min-width: 0; }
  .session-copy { display: grid; gap: 4px; min-width: 0; }
  strong { font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); }
  .session-copy span, .session-details { font-size: var(--font-size-xs); color: var(--color-light-tertiary); }
  .session-copy strong, .session-copy span { overflow-wrap: anywhere; }
  .session-copy { flex: 1 1 220px; }
  .capture-reason { margin: 0; font-size: var(--font-size-xs); color: var(--color-light-tertiary); }
  .controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .session-details { display: flex; flex-wrap: wrap; gap: 8px 20px; padding: 10px 0; }
  .endpoint { display: flex; align-items: end; gap: 12px; }
  .endpoint :global(.ui-input) { flex: 1; }
</style>
