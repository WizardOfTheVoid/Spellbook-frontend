<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import Tabs from '$lib/components/ui/tabs.svelte'
  import Button from '$lib/components/ui/Button.svelte'
  import EmptyState from '$lib/components/ui/EmptyState.svelte'
  import { currentServerSummary } from '$lib/gameState/currentServerStore'
  import { getTelemetrySession } from './session/telemetrySessionOrchestrator'
  import type { TelemetryTab } from './session/telemetryModels'
  import SessionToolbar from './session/sessionToolbar.svelte'
  import RecordingsLibrary from './session/recordingsLibrary.svelte'
  import PlayerRoster from './players/playerRoster.svelte'
  import PlayerIdentity from './players/playerIdentity.svelte'
  import OverviewView from './overview/overviewView.svelte'
  import EventFeed from './events/eventFeed.svelte'
  import MapView from './map/mapView.svelte'
  import SessionTimeline from './timeline/sessionTimeline.svelte'

  export let active = true
  const model = getTelemetrySession()
  const view = model.view
  const viewTabs = [
    { value: `overview`, label: `Overview` },
    { value: `kills`, label: `Kills` },
    { value: `combat`, label: `Combat` },
    { value: `items`, label: `Items` },
    { value: `map`, label: `Map` }
  ]
  let mounted = false
  let visible = false
  let disconnect: (() => void) | null = null
  onMount(() => {
    mounted = true
    const changed = () => visible = document.visibilityState !== `hidden`
    changed()
    document.addEventListener(`visibilitychange`, changed)
    return () => document.removeEventListener(`visibilitychange`, changed)
  })
  onDestroy(() => disconnect?.())
  $: if (mounted && active && visible && !disconnect) disconnect = model.connect()
  $: if ((!active || !mounted || !visible) && disconnect) {
    disconnect()
    disconnect = null
  }
  $: if (!$view.busy && $view.liveSession?.status !== `recording`) model.setServerAddress($currentServerSummary.serverAddress)
  $: workspace = model.workspace($view)
  $: snapshot = model.getSnapshot($view)
  $: live = $view.source === `live`
  $: session = live ? $view.liveSession : $view.recordings.find(item => item.id === workspace.sessionId) ?? null
  $: recording = $view.liveSession?.status === `recording`
  $: durationMs = live ? $view.headMs : session?.durationMs ?? 0
  $: player = snapshot?.players.find(item => item.id === workspace.selectedPlayerId) ?? null
</script>

<div class="telemetry">
  {#if $view.error}<div class="notice" role="alert">{$view.error}</div>{/if}
  {#if $view.job}
    <div class="notice" role="status">
      <span>{$view.job.kind === `import` ? `Import` : `Reprocess`}: {$view.job.state}
        {#if $view.job.total > 0} · {Math.round($view.job.processed / $view.job.total * 100)}%{/if}
      </span>
      {#if $view.job.state === `running` || $view.job.state === `queued`}
        <Button label="Cancel" size="sm" onClick={() => model.cancelJob()} />
      {/if}
    </div>
  {/if}
  <div class="session">
    {#if mounted && active && visible}
      {#if !live && !session}
        <RecordingsLibrary recordings={$view.recordings} busy={$view.busy} onImport={() => model.importRecording()} onOpen={id => model.openRecording(id)} />
      {:else}
        <SessionToolbar {session} {recording} {live} elapsedMs={durationMs}
          endpoint={$view.endpoint} endpointOverride={$view.endpointOverride} busy={$view.busy}
          selectedServer={$view.selectedServer} onSelectServer={server => model.selectServer(server)}
          currentServerName={$currentServerSummary.serverDisplayName} currentServerAddress={$currentServerSummary.serverAddress}
          captureAvailable={$view.status?.capture.available ?? false} captureReason={$view.status?.capture.reason ?? null}
          onEndpoint={value => model.setEndpoint(value)} onCurrentServer={() => model.useCurrentServer($currentServerSummary.serverAddress)}
          onReprocess={() => session && model.reprocessRecording(session.id)}
          onRecord={() => model.startRecording()} onStop={() => model.stopRecording()} onClose={() => model.closeRecording()} />
        {#if snapshot}
          {#if snapshot.richFieldsAvailable === false}
            <div class="notice">This recording has limited player fields. Reprocess it to recover supported observations.</div>
          {/if}
          <div class="workspace">
            <PlayerRoster players={snapshot.roster ? snapshot.players.filter(player => snapshot!.roster!.playerIds.includes(player.id)) : snapshot.players}
              page={snapshot.roster?.page ?? 1} hasNext={snapshot.roster?.hasNext ?? false}
              onPage={page => model.setRosterPage(page)} selectedPlayerId={workspace.selectedPlayerId} onSelect={id => model.selectPlayer(id)} />
            <div class="inspector">
              <PlayerIdentity {player} selectedPlayerId={workspace.selectedPlayerId} playerCount={snapshot.players.length} />
              <Tabs items={viewTabs} value={workspace.tab} label="Telemetry views" compact fill onChange={value => model.setTab(value as TelemetryTab)}>
                <div class="view-content" class:view-content--map={workspace.tab === `map`}>
                  {#if workspace.tab === `overview`}
                    <OverviewView {snapshot} selectedPlayerId={workspace.selectedPlayerId} onSelectPlayer={id => model.selectPlayer(id)} />
                  {:else if workspace.tab === `map`}
                    <MapView {snapshot} selectedPlayerId={workspace.selectedPlayerId} onSelectPlayer={id => model.selectPlayer(id)} />
                  {:else}
                    <EventFeed {snapshot} selectedPlayerId={workspace.selectedPlayerId}
                      tab={workspace.tab === `kills` || workspace.tab === `items` ? workspace.tab : `combat`}
                      filter={$view.filters[live ? `live` : `replay`][workspace.tab === `kills` || workspace.tab === `items` ? workspace.tab : `combat`]}
                      onFilter={(tab, filter) => model.setFilter(tab, filter)} onPage={(tab, page) => model.setEventPage(tab, page)}
                      onSeek={timeMs => model.seek(timeMs)} onSelectPlayer={id => model.selectPlayer(id)} />
                  {/if}
                </div>
              </Tabs>
            </div>
          </div>
          <SessionTimeline {workspace} {durationMs} {live} {recording}
            onSeek={timeMs => model.seek(timeMs)} onSeekEnd={timeMs => model.seek(timeMs, true)} onPlay={() => model.play()} onPause={() => model.pause()}
            onGoLive={() => model.goLive()} onSpeed={speed => model.setSpeed(speed)} />
        {:else}
          <div class="idle">
            <EmptyState title={session ? `Loading session` : `Explore a session`} message={session ? `Reading recorded observations…` : `Record a game server or open a saved capture to explore players, combat, items and movement.`} />
            <Button label="Browse recordings" icon="fa-folder-open" onClick={() => model.setSource(`recordings`)} />
          </div>
        {/if}
      {/if}
    {/if}
  </div>
</div>

<style lang="scss">
  .telemetry { container: telemetry / inline-size; height: 100%; min-height: 0; min-width: 0; display: flex; flex-direction: column; gap: 14px; padding: 0 26px 24px; }
  .notice { display: flex; align-items: center; gap: 10px; color: var(--color-light-tertiary); font-size: var(--font-size-xs); }
  .telemetry :global(.tabs), .telemetry :global(.tabs__panel) { gap: 16px; min-height: 0; }
  .session { display: flex; flex-direction: column; flex: 1; min-height: 0; gap: 18px; }
  .session > :global(.library) { flex: 1; }
  .workspace { display: grid; grid-template-columns: 202px minmax(0, 1fr); gap: 22px; min-height: 0; flex: 1; }
  .inspector { min-height: 0; min-width: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 16px; }
  .view-content { min-height: 0; overflow-y: auto; padding: 0 6px 6px 0; }
  .view-content--map { display: grid; grid-template-rows: minmax(380px, 1fr); }
  .idle { margin: auto 0; display: grid; justify-items: center; gap: 18px; }
  @container telemetry (max-width: 759px) {
    .workspace { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); gap: 16px; }
  }
  @container telemetry (max-width: 479px) {
    .inspector :global(.tabs__list) { overflow-x: auto; }
    .inspector :global(.tabs__list button) { flex: 0 0 auto; min-width: 74px; }
  }
  @media (max-height: 800px) {
    .workspace { overflow-y: auto; align-content: start; align-items: start; grid-template-rows: auto; padding-right: 4px; }
    .inspector { grid-template-rows: auto auto; }
    .inspector :global(.tabs--fill), .inspector :global(.tabs__panel) { grid-template-rows: auto; }
    .workspace :global(.roster-list), .view-content { overflow: visible; }
  }
</style>
