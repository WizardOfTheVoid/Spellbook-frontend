<script lang="ts">
  import { onDestroy } from 'svelte'
  import { actionEventsLimits } from '@spellbook/shared/actionEvents'
  import SearchField from '../ui/SearchField.svelte'
  import Select from '../ui/Select.svelte'
  import IconButton from '../ui/IconButton.svelte'
  import FilterChipRow from '../ui/FilterChipRow.svelte'
  import type { FilterChip } from '$lib/types/ui'
  import spellBookLogo from '$lib/resources/logo-plain.svg?url'
  import ActionEventsFiltersModal from './actionEventsFiltersModal.svelte'
  import { createActionEventsQuery, actionEventsAdvancedCount, hasActionEventsFilters,
    scopeActionEventsCatalog, setActionEventsSource, setActionEventsSystem } from './actionEventsQuery'
  import { createQueryDebouncer } from '$lib/utils/archiveRequests'
  import type { ActionEventsCatalog, ActionEventsQuery, ActionEventsStatus } from './actionEventsTypes'

  export let query: ActionEventsQuery
  export let catalog: ActionEventsCatalog
  export let canViewAllTeams = false
  export let onChange: (query: ActionEventsQuery) => void
  export let advancedOpen = false

  let search = query.search
  let appliedQuery = query
  let filtersButton: HTMLButtonElement | undefined
  const debouncer = createQueryDebouncer<string>(value => onChange({ ...query, search: value }))
  onDestroy(() => debouncer.cancel())
  $: if (query !== appliedQuery) {
    debouncer.cancel()
    appliedQuery = query
    search = query.search
  }
  $: visibleCatalog = scopeActionEventsCatalog(catalog, canViewAllTeams)
  $: advancedCount = actionEventsAdvancedCount(query)
  const chips: FilterChip[] = [
    { id: `spellbook`, label: `In app`, icon: `fa-window-maximize`, tooltip: `Actions performed in SpellBook.` },
    { id: `discord`, label: `Discord`, icon: `fa-discord`, iconType: `brands`, tooltip: `Actions performed in Discord.` },
    { id: `system`, label: `System`, iconSrc: spellBookLogo, tooltip: `Show only automated actions, such as Wanted bans.` }
  ]
  const statuses = [
    { value: `all`, label: `Everything` }, { value: `pending`, label: `Pending` }, { value: `completed`, label: `Completed` },
    { value: `failed`, label: `Failed` }, { value: `cancelled`, label: `Cancelled` }, { value: `expired`, label: `Expired` },
    { value: `unknown`, label: `Unknown` }
  ]

  function change(next: ActionEventsQuery): void {
    debouncer.cancel()
    onChange({ ...next, search })
  }

  function reset(): void {
    debouncer.cancel()
    search = ``
    onChange(createActionEventsQuery())
  }
</script>

<div class="action-events-filters">
  <SearchField bind:value={search} label="Search" maxLength={actionEventsLimits.search} placeholder="Search player, admin, action or server…" onInput={() => debouncer.schedule(search)}>
    <svelte:fragment slot="trailing">
      <IconButton bind:element={filtersButton} icon="fa-sliders" position="absolute" ariaLabel="Advanced filters" expanded={advancedOpen}
        controls="action-events-filters-dialog" hasPopup="dialog" badge={advancedCount || null} accentColor="var(--color-accent-secondary)"
        active={advancedOpen || advancedCount > 0} onClick={() => advancedOpen = !advancedOpen} />
    </svelte:fragment>
  </SearchField>
  <div class="action-events-filters__controls">
    <FilterChipRow {chips} selected={query.systemOnly ? [`system`] : query.sources} onReset={reset}
      onToggle={id => change(id === `system` ? setActionEventsSystem(query) : setActionEventsSource(query, id as `spellbook` | `discord`))} />
    <div class="action-events-filters__status"><Select ariaLabel="Status" value={query.status} options={statuses}
      onChange={value => change({ ...query, status: value as ActionEventsStatus })} /></div>
  </div>
</div>
{#if advancedOpen}<ActionEventsFiltersModal {query} catalog={visibleCatalog} trigger={filtersButton} onChange={change} onReset={reset}
  canReset={Boolean(search) || hasActionEventsFilters(query)} onClose={() => advancedOpen = false} />{/if}

<style lang="scss">
  .action-events-filters { display: grid; gap: var(--gutter-md); }
  .action-events-filters :global(.ui-tag__image) { width: var(--icon-size-xlg); height: var(--icon-size-xlg); }
  .action-events-filters__controls { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gutter-md); justify-content: space-between; }
  .action-events-filters__status { flex: 0 1 auto; min-width: calc(var(--font-size-md) * 12); }
</style>
