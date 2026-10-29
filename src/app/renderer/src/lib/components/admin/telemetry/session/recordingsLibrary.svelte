<script lang="ts">
  import ListRow from '$lib/components/ui/ListRow.svelte'
  import Input from '$lib/components/ui/Input.svelte'
  import Tag from '$lib/components/ui/Tag.svelte'
  import EmptyState from '$lib/components/ui/EmptyState.svelte'
  import Button from '$lib/components/ui/Button.svelte'
  import type { TelemetrySession } from './telemetryModels'
  import { formatRecordTime } from '../timeline/timelineController'
  export let recordings: TelemetrySession[]
  export let onOpen: (id: string) => void
  export let onImport: () => void
  export let busy = false
  let query = ``
  $: filtered = recordings.filter(session => `${session.name} ${session.serverName}`.toLowerCase().includes(query.trim().toLowerCase()))
</script>

<section class="library" aria-label="Saved recordings">
  <header><strong>Recordings</strong><p>Saved captures stay available after restarting SpellBook.</p>
    <Button label="Import recording" icon="fa-file-import" size="sm" disabled={busy} onClick={onImport} />
  </header>
  <Input label="Find a recording" type="search" placeholder="Session or server" value={query} onChange={value => query = value} />
  <div class="recording-list">
    {#each filtered as session (session.id)}
      <ListRow title={session.name} subtitle={session.serverName} onClick={() => onOpen(session.id)}>
        <span slot="meta" class="date">{new Date(session.startedAt).toLocaleString()}</span>
        <Tag slot="trailing" compact label={formatRecordTime(session.durationMs * 1000)} />
      </ListRow>
    {:else}<EmptyState title="No matching recordings" message="Try another session or server name." />{/each}
  </div>
</section>

<style>
  .library { min-height: 0; display: grid; grid-template-rows: auto auto minmax(0, 1fr); gap: 18px; }
  header { display: grid; gap: 6px; }
  strong { font-size: var(--font-size-lg); font-weight: var(--font-weight-medium); }
  p { margin: 0; font-size: var(--font-size-xs); color: var(--color-light-tertiary); }
  .recording-list { overflow-y: auto; display: grid; align-content: start; gap: 10px; padding: 0 5px 5px 0; }
  .date { font-size: var(--font-size-xs); color: var(--color-light-tertiary); }
</style>
