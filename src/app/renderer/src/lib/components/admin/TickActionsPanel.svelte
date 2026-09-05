<script lang="ts">
  import { onDestroy } from 'svelte'
  import {
    filterTickActionLogs,
    mergeTickActionLogs,
    nextTickActionLogAfterId,
    tickActionControlMessage,
    tickActionLogBatchDelay,
    tickActionLogClearState,
    tickActionLogCounts,
    tickActionLogCue,
    tickActionLogLimit,
    tickActionPollDelay,
    tickActionProcessedValue,
    tickActionSummaries,
    type TickAction,
    type TickActionLog,
    type TickActionLogLevel,
    type TickActionSummary
  } from '$lib/core'
  import { SFX } from '$lib/global/sfx'
  import { notifyError, notifySuccess } from '$lib/notifications/notificationEvents'
  import type { Tone } from '$lib/types/tone'
  import { unwrap } from '$lib/utils/apiResult'
  import Button from '$lib/components/ui/Button.svelte'
  import EmptyState from '$lib/components/ui/EmptyState.svelte'
  import Tag from '$lib/components/ui/Tag.svelte'
  import Tile from '$lib/components/ui/Tile.svelte'
  import TileGrid from '$lib/components/ui/TileGrid.svelte'

  export let active = false
  export let selectedAction: TickAction | null = null

  let actions = tickActionSummaries([])
  let loading = false
  let controlling = false
  let polling = false
  let pollTimer: number | null = null
  let logs: TickActionLog[] = []
  let logRunId: number | null = null
  let logAfterId = 0
  let logsHydrated = false
  let logsLoading = false
  let logQueue: Array<{ log: TickActionLog, delayMs: number }> = []
  let logQueueTimer: number | null = null
  let logClearVersion = 0
  let selectedLogLevels = new Set<TickActionLogLevel>()

  $: selected = actions.find(action => action.action === selectedAction) ?? null
  $: visibleLogs = filterTickActionLogs(logs, selectedLogLevels)
  $: logCounts = tickActionLogCounts(logs)
  $: if (active) startPolling()
  $: if (!active) stopPolling()
  $: if (!selectedAction) resetLogs(null)

  onDestroy(stopPolling)

  function startPolling(): void {
    if (polling) return
    polling = true
    void poll(false)
  }

  function stopPolling(): void {
    polling = false
    if (pollTimer !== null) window.clearTimeout(pollTimer)
    pollTimer = null
    clearLogQueue()
  }

  async function poll(silent: boolean): Promise<void> {
    await loadActions(silent)
    if (!polling) return
    await loadSelectedLogs(silent, silent)
    if (!polling) return

    const delayMs = tickActionPollDelay(actions.map(action => action.status))
    pollTimer = window.setTimeout(() => {
      pollTimer = null
      void poll(true)
    }, delayMs)
  }

  function restartPolling(): void {
    if (!polling) return
    if (pollTimer !== null) window.clearTimeout(pollTimer)
    pollTimer = window.setTimeout(() => {
      pollTimer = null
      void poll(true)
    }, 0)
  }

  async function loadActions(silent = false): Promise<void> {
    if (loading) return
    loading = true

    try {
      actions = tickActionSummaries(
        await unwrap<TickActionSummary[]>(
          await window.chivServer.admin.tickActions.list(),
          'Tick actions request failed.'
        )
      )
    } catch (error) {
      if (!silent) notifyError(message(error), { dedupeKey: 'admin:tick-actions' })
    } finally {
      loading = false
    }
  }

  async function control(type: 'start' | 'stop' | 'resume'): Promise<void> {
    if (!selected || controlling) return
    controlling = true

    try {
      await unwrap(
        await window.chivServer.admin.tickActions[type](selected.action),
        `Tick action ${type} failed.`
      )
      notifySuccess(tickActionControlMessage(selected.label, type))
      await loadActions(true)
      await loadSelectedLogs(true, true)
      restartPolling()
    } catch (error) {
      notifyError(message(error), { dedupeKey: `admin:tick-actions:${type}` })
    } finally {
      controlling = false
    }
  }

  function subtitle(action: TickActionSummary): string {
    const run = action.run
    if (!run) return action.nextRunAt ? `Starts in ${remaining(action.nextRunAt)}` : 'No runs yet'
    const records = run.totalRecords === null
      ? `${run.processedRecords.toLocaleString()} records`
      : `${run.processedRecords.toLocaleString()} / ${run.totalRecords.toLocaleString()} records`
    return `${records} · ${duration(run.durationMs)}`
  }

  function statusTone(action: TickActionSummary): Tone {
    if (action.status === 'failed') return 'danger'
    if (action.status === 'running' || action.status === 'stopping') return 'warning'
    if (action.status === 'completed') return 'success'
    return 'default'
  }

  function label(value: string): string {
    return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
  }

  function tileStatus(action: TickActionSummary): string {
    if ((action.status === 'idle' || action.status === 'completed') && action.nextRunAt) {
      return `Starts in ${remaining(action.nextRunAt)}`
    }

    return label(action.status)
  }

  function duration(milliseconds: number | null): string {
    if (milliseconds === null) return 'Unknown'
    const seconds = Math.max(0, Math.round(milliseconds / 1000))
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    if (hours) return `${hours}h ${minutes % 60}m`
    if (minutes) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
  }

  function remaining(value: string): string {
    return duration(Math.max(0, new Date(value).getTime() - Date.now()))
  }

  function date(value: string | null): string {
    return value ? new Date(value).toLocaleString() : 'Never'
  }

  function message(error: unknown): string {
    return error instanceof Error ? error.message : 'Tick actions request failed.'
  }

  function openAction(action: TickActionSummary): void {
    selectedAction = action.action
    void loadSelectedLogs(false)
  }

  async function loadSelectedLogs(silent: boolean, revealInitial = false): Promise<void> {
    const runId = actions.find(action => action.action === selectedAction)?.run?.id ?? null
    if (runId !== logRunId) { resetLogs(runId) }
    if (!runId || logsLoading) return

    logsLoading = true
    const requestedRunId = runId
    const requestedClearVersion = logClearVersion

    try {
      const incoming = await unwrap<TickActionLog[]>(
        await window.chivServer.admin.tickActions.logs(
          runId,
          logsHydrated ? logAfterId : undefined
        ),
        'Tick action logs request failed.'
      )
      if (logRunId !== requestedRunId) return

      const nextAfterId = nextTickActionLogAfterId(
        logAfterId,
        incoming,
        requestedClearVersion,
        logClearVersion
      )
      if (nextAfterId === null) return

      const previousAfterId = logAfterId
      logAfterId = nextAfterId
      if (!logsHydrated) {
        logsHydrated = true
        if (revealInitial) {
          enqueueLogs(incoming)
        } else {
          logs = mergeTickActionLogs([], incoming)
        }
      } else {
        enqueueLogs(incoming.filter(log => log.id > previousAfterId))
      }
    } catch (error) {
      if (!silent) notifyError(message(error), { dedupeKey: 'admin:tick-action-logs' })
    } finally {
      logsLoading = false
    }
  }

  function enqueueLogs(incoming: TickActionLog[]): void {
    const knownIds = new Set([
      ...logs.map(log => log.id),
      ...logQueue.map(item => item.log.id)
    ])
    const fresh = incoming
      .filter(log => !knownIds.has(log.id))
      .sort((left, right) => left.id - right.id)
    if (!fresh.length) return

    const delayMs = tickActionLogBatchDelay(100, fresh.length)
    logQueue = [...logQueue, ...fresh.map(log => ({ log, delayMs }))].slice(-tickActionLogLimit)
    if (logQueueTimer === null) { revealNextLog() }
  }

  function revealNextLog(): void {
    logQueueTimer = null
    const next = logQueue.shift()
    if (!next) return

    logs = mergeTickActionLogs(logs, [next.log])
    if (active && selectedAction) {
      SFX.play(tickActionLogCue(next.log.level), {
        volume: 0.15,
        retrigger: 'overlap',
        cooldownMs: 0
      })
    }

    if (logQueue.length) {
      logQueueTimer = window.setTimeout(revealNextLog, next.delayMs)
    }
  }

  function resetLogs(runId: number | null): void {
    if (runId === logRunId && (runId !== null || logs.length === 0)) return
    discardLogs()
    logRunId = runId
    logAfterId = runId === null ? 0 : tickActionLogClearState.clearedThrough(runId)
    logsHydrated = logAfterId > 0
  }

  function clearLogs(): void {
    logClearVersion += 1
    if (logRunId !== null) {
      tickActionLogClearState.clearThrough(logRunId, logAfterId)
    }
    discardLogs()
  }

  function discardLogs(): void {
    clearLogQueue()
    logs = []
  }

  function clearLogQueue(): void {
    if (logQueueTimer !== null) window.clearTimeout(logQueueTimer)
    logQueueTimer = null
    logQueue = []
  }

  function toggleLogLevel(level: TickActionLogLevel): void {
    const next = new Set(selectedLogLevels)
    if (next.has(level)) {
      next.delete(level)
    } else {
      next.add(level)
    }
    selectedLogLevels = next
  }

  function showAllLogs(): void {
    selectedLogLevels = new Set()
  }

  function logTime(value: string): string {
    return new Date(value).toLocaleTimeString()
  }
</script>

{#if selected}
  <div class="tick-action grid-stack gap-125">
    <div class="tick-action__controls">
      <span class="tick-action__control-group">
        <Button
          label="Force Start"
          icon="fa-play"
          variant="primary"
          disabled={controlling || selected.status === 'running' || selected.status === 'stopping'}
          onClick={() => void control('start')}
        />
        <Button
          label="Stop"
          icon="fa-stop"
          disabled={controlling || !selected.supportsPause || selected.status !== 'running'}
          tooltip={selected.supportsPause ? null : 'Servers finish in one pass.'}
          onClick={() => void control('stop')}
        />
        <Button
          label="Resume"
          icon="fa-forward"
          disabled={controlling || !selected.supportsPause || (selected.status !== 'paused' && selected.status !== 'failed')}
          tooltip={selected.supportsPause ? null : 'Servers finish in one pass.'}
          onClick={() => void control('resume')}
        />
      </span>
    </div>

    <TileGrid columns={2}>
      <Tile title="Status" value={label(selected.status)} icon="fa-wave-square" tone={statusTone(selected)} />
      <Tile title="Processed" value={selected.run ? tickActionProcessedValue(selected.run.processedRecords, selected.run.durationMs) : '0'} icon="fa-database" />
      <Tile title="Total" value={selected.run?.totalRecords?.toLocaleString() ?? 'Unknown'} icon="fa-list-ol" />
      <Tile title="Duration" value={duration(selected.run?.durationMs ?? null)} icon="fa-stopwatch" />
      <Tile title="Time left" value={duration(selected.estimatedRemainingMs)} icon="fa-hourglass-half" />
      <Tile title="Next scheduled run" value={selected.nextRunAt ? remaining(selected.nextRunAt) : 'Unknown'} icon="fa-calendar" />
      <Tile title="Started" value={date(selected.run?.startedAt ?? null)} icon="fa-play" />
      <Tile title="Finished" value={date(selected.run?.finishedAt ?? null)} icon="fa-flag-checkered" />
    </TileGrid>

    {#if selected.run?.error}
      <EmptyState title="Action failed" message={selected.run.error} />
    {/if}

    <section class="tick-action__logs">
      <div class="tick-action__logs-header">
        <strong>Run logs</strong>
        <div class="tick-action__log-filters">
          <Tag label={`All (${logCounts.all})`} selected={selectedLogLevels.size === 0} onClick={showAllLogs} />
          <Tag label={`General (${logCounts.general})`} selected={selectedLogLevels.has('general')} onClick={() => toggleLogLevel('general')} />
          <Tag label={`Warnings (${logCounts.warning})`} selected={selectedLogLevels.has('warning')} onClick={() => toggleLogLevel('warning')} />
          <Tag label={`Errors (${logCounts.error})`} selected={selectedLogLevels.has('error')} onClick={() => toggleLogLevel('error')} />
          <Button label="Clear" size="sm" disabled={!logs.length && !logQueue.length} onClick={clearLogs} />
        </div>
      </div>

      <div class="tick-action__log-window">
        {#if visibleLogs.length}
          {#each visibleLogs as log (log.id)}
            <div class="tick-action__log-line tick-action__log-line--{log.level}">
              <time>{logTime(log.createdAt)}</time>
              <b>{log.level === 'general' ? 'General' : log.level === 'warning' ? 'Warning' : 'Error'}</b>
              <span>{log.message}</span>
            </div>
          {/each}
        {:else}
          <span class="tick-action__log-empty">
            {logsLoading && !logsHydrated ? 'Loading logs...' : 'No matching logs.'}
          </span>
        {/if}
      </div>
    </section>
  </div>
{:else if actions.length}
  <TileGrid columns={1}>
    {#each actions as action (action.action)}
      <Tile
        title={action.label}
        value={tileStatus(action)}
        subtitle={subtitle(action)}
        icon={action.action === 'leaderboard' ? 'fa-ranking-star' : 'fa-server'}
        tone={statusTone(action)}
        onClick={() => openAction(action)}
      />
    {/each}
  </TileGrid>
{:else}
  <EmptyState
    title={loading ? 'Loading tick actions' : 'No tick actions'}
    message={loading ? 'Fetching action state.' : 'No action runs are available.'}
  />
{/if}

<style lang="scss">
  .tick-action__controls {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--gutter-md);
  }

  .tick-action__control-group {
    display: flex;
    gap: var(--gutter-sm);
  }

  .tick-action__logs {
    display: grid;
    gap: var(--gutter-sm);
  }

  .tick-action__logs-header,
  .tick-action__log-filters {
    display: flex;
    align-items: center;
    gap: var(--gutter-sm);
  }

  .tick-action__logs-header {
    justify-content: space-between;
  }

  .tick-action__log-filters {
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .tick-action__log-window {
    height: 280px;
    overflow-y: auto;
    border: 1px solid var(--color-dark-tertiary);
    border-radius: var(--radius);
    background: var(--color-dark-primary);
    font-family: Consolas, "Courier New", monospace;
  }

  .tick-action__log-line {
    display: grid;
    grid-template-columns: 100px 70px minmax(0, 1fr);
    gap: var(--gutter-sm);
    padding: var(--gutter-sm) var(--gutter-md);
    border-bottom: 1px solid var(--color-dark-secondary);
    color: var(--color-light-secondary);
    font-size: var(--font-size-xs);

    time {
      color: var(--color-light-tertiary);
    }

    span {
      overflow-wrap: anywhere;
    }
  }

  .tick-action__log-line--warning b {
    color: var(--color-accent-tertiary);
  }

  .tick-action__log-line--error b {
    color: var(--color-accent-quaternary);
  }

  .tick-action__log-empty {
    display: block;
    padding: var(--gutter-md);
    color: var(--color-text-secondary);
    font-size: var(--font-size-xs);
  }
</style>
