<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import Input from '$lib/components/ui/Input.svelte'
  import Select from '$lib/components/ui/Select.svelte'
  import PaginationControls from '$lib/components/ui/PaginationControls.svelte'
  import { getServers } from '$lib/utils/gameServersApi'
  import { TelemetryServerSearch, type TelemetryServerTarget } from './telemetryServerSelection'

  export let onSelect: (server: TelemetryServerTarget) => void
  const search = new TelemetryServerSearch(getServers)
  const view = search.view
  let query = ``
  let timer: ReturnType<typeof setTimeout> | undefined
  const load = (page = 1) => search.load(query.trim(), page)
  function changeQuery(value: string) {
    query = value
    clearTimeout(timer)
    timer = setTimeout(() => void load(), 250)
  }
  onMount(() => { void load() })
  onDestroy(() => {
    clearTimeout(timer)
    search.dispose()
  })
  function select(value: string) {
    const server = $view.targets.find(server => `${server.id}` === value)
    if (server) onSelect(server)
  }
</script>

<div class="server-picker">
  <Input label="Find a server" type="search" value={query} onChange={changeQuery} placeholder="Server name or address" />
  <Select label="Server to record" value="" options={$view.targets.map(server => ({
    value: `${server.id}`, label: server.name, description: server.address
  }))} disabled={$view.loading} placeholder={$view.loading ? `Loading servers…` : `Choose a server`}
    hint="Start recording before joining this server to capture its initial observations."
    onChange={select} />
  {#if $view.error}<p role="alert">{$view.error}</p>{/if}
  {#if $view.hasPrevious || $view.hasNext}
    <PaginationControls currentPage={$view.page} totalPages={$view.totalPages}
      hasPrevious={$view.hasPrevious} hasNext={$view.hasNext} disabled={$view.loading}
      onPrevious={() => load($view.page - 1)} onNext={() => load($view.page + 1)} />
  {/if}
</div>

<style>
  .server-picker { display: grid; gap: 12px; }
  p { margin: 0; font-size: var(--font-size-xs); color: var(--color-accent-quaternary); }
</style>
