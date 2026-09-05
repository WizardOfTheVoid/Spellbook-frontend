<script lang="ts">
  import { onDestroy } from 'svelte'
  import type { AuditLogRecord } from '$lib/core'
  import { authState } from '$lib/auth/user'
  import Button from '$lib/components/ui/Button.svelte'
  import DateInput from '$lib/components/ui/DateInput.svelte'
  import EmptyState from '$lib/components/ui/EmptyState.svelte'
  import Input from '$lib/components/ui/Input.svelte'
  import { notifyError } from '$lib/notifications/notificationEvents'
  import {
    AuditLogsController,
    type AuditLogFilters,
    type AuditLogsState
  } from './auditLogsController'

  export let active = false

  const blankFilters: AuditLogFilters = {
    eventType: '',
    actorId: '',
    targetType: '',
    targetId: '',
    gameServerId: '',
    outcome: '',
    createdFrom: '',
    createdTo: ''
  }

  let filters = { ...blankFilters }
  let state: AuditLogsState = {
    logs: [],
    nextBeforeId: null,
    loading: false,
    error: null
  }
  let loadedUserId: number | null = null
  const controller = new AuditLogsController(undefined, next => { state = next })

  $: {
    const userId = $authState.user?.id ?? null
    controller.setContext(userId, active)
    if (active && userId && loadedUserId !== userId) {
      loadedUserId = userId
      void reload()
    } else if (!active || !userId) {
      loadedUserId = null
    }
  }

  onDestroy(() => controller.destroy())

  function setFilter(key: keyof AuditLogFilters, value: string): void {
    filters = { ...filters, [key]: value }
  }

  async function reload(): Promise<void> {
    report(await controller.reset(filters))
  }

  async function loadMore(): Promise<void> {
    report(await controller.loadMore())
  }

  function resetFilters(): void {
    filters = { ...blankFilters }
    void reload()
  }

  function report(outcome: { ok: boolean, message?: string } | null): void {
    if (outcome && !outcome.ok) {
      notifyError(outcome.message ?? 'Audit log request failed.', {
        dedupeKey: 'admin:audit-logs'
      })
    }
  }

  function date(value: string): string {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString()
  }

  function meta(log: AuditLogRecord): string {
    return JSON.stringify(log.meta, null, 2)
  }
</script>

<section class="audit-logs">
  <div class="audit-logs__filters">
    <Input label="Event" value={filters.eventType ?? ''} placeholder="wanted.executed" onChange={value => setFilter('eventType', value)} />
    <Input label="Actor ID" value={filters.actorId ?? ''} placeholder="User ID" onChange={value => setFilter('actorId', value)} />
    <Input label="Target type" value={filters.targetType ?? ''} placeholder="player" onChange={value => setFilter('targetType', value)} />
    <Input label="Target ID" value={filters.targetId ?? ''} placeholder="Target identifier" onChange={value => setFilter('targetId', value)} />
    <Input label="Server ID" value={filters.gameServerId ?? ''} placeholder="Game server ID" onChange={value => setFilter('gameServerId', value)} />
    <Input label="Outcome" value={filters.outcome ?? ''} placeholder="success" onChange={value => setFilter('outcome', value)} />
    <DateInput label="From" value={filters.createdFrom ?? ''} onChange={value => setFilter('createdFrom', value)} />
    <DateInput label="To" value={filters.createdTo ?? ''} onChange={value => setFilter('createdTo', value)} />
  </div>

  <div class="audit-logs__actions">
    <Button label="Apply filters" icon="fa-filter" variant="primary" disabled={state.loading} onClick={() => void reload()} />
    <Button label="Reset filters" icon="fa-rotate-left" disabled={state.loading} onClick={resetFilters} />
  </div>

  <div class="audit-logs__list">
    {#each state.logs as log (log.id)}
      <article class="audit-log">
        <header>
          <strong>{log.eventType}</strong>
          <span>{log.outcome}</span>
        </header>
        <dl>
          <div><dt>Time</dt><dd>{date(log.createdAt)}</dd></div>
          <div><dt>Actor</dt><dd>{log.actorId ?? 'System'}</dd></div>
          <div><dt>Target</dt><dd>{log.targetType} · {log.targetId}</dd></div>
          <div><dt>Server</dt><dd>{log.gameServerId ?? 'None'}</dd></div>
          <div><dt>Correlation</dt><dd>{log.correlationId ?? 'None'}</dd></div>
        </dl>
        <pre>{meta(log)}</pre>
      </article>
    {:else}
      <EmptyState
        title={state.loading ? 'Loading audit logs' : 'No audit logs'}
        message={state.error ?? (state.loading ? 'Fetching historical actions.' : 'No records match these filters.')}
      />
    {/each}
  </div>

  {#if state.logs.length && state.nextBeforeId !== null}
    <Button
      label={state.loading ? 'Loading…' : 'Load more'}
      icon="fa-chevron-down"
      disabled={state.loading}
      onClick={() => void loadMore()}
    />
  {/if}
</section>

<style lang="scss">
  .audit-logs {
    display: grid;
    align-content: start;
    gap: var(--gutter-lg);
  }

  .audit-logs__filters {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--gutter-md);
  }

  .audit-logs__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--gutter-sm);
  }

  .audit-logs__list {
    display: grid;
    gap: var(--gutter-md);
  }

  .audit-log {
    display: grid;
    gap: var(--gutter-md);
    border: 1px solid var(--color-dark-tertiary);
    border-radius: var(--radius);
    padding: var(--gutter-md);
    background: var(--color-dark-primary);
  }

  .audit-log header {
    display: flex;
    justify-content: space-between;
    gap: var(--gutter-md);
  }

  .audit-log header span,
  dt {
    color: var(--color-light-tertiary);
    font-size: var(--font-size-xs);
  }

  dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--gutter-sm) var(--gutter-lg);
    margin: 0;
  }

  dl div {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  pre {
    max-height: 180px;
    margin: 0;
    overflow: auto;
    border-radius: var(--radius);
    padding: var(--gutter-sm);
    color: var(--color-light-secondary);
    background: var(--color-dark-secondary);
    font-size: var(--font-size-xs);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  @media (max-width: 760px) {
    .audit-logs__filters,
    dl {
      grid-template-columns: 1fr;
    }
  }
</style>
