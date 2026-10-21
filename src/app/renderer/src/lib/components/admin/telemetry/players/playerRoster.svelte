<script lang="ts">
  import Input from '$lib/components/ui/Input.svelte'
  import Select from '$lib/components/ui/Select.svelte'
  import ListRow from '$lib/components/ui/ListRow.svelte'
  import Avatar from '$lib/components/ui/avatar.svelte'
  import PaginationControls from '$lib/components/ui/PaginationControls.svelte'
  import { playerLabel } from '../preview/telemetrySelectors'
  import type { TelemetryPlayer } from '../session/telemetryModels'
  import { playerObservationLabel } from './playerPresentation'

  export let players: TelemetryPlayer[]
  export let selectedPlayerId: string | null
  export let onSelect: (id: string | null) => void
  export let page = 1
  export let hasNext = false
  export let onPage: (page: number) => void = () => {}
  let query = ``
  $: matches = players.filter(player =>
    `${playerLabel(player)} ${player.playFabId ?? ``} ${player.id}`.toLowerCase().includes(query.trim().toLowerCase()))
  $: options = [
    { value: `all`, label: `All tracks (${players.length})` },
    ...players.map(player => ({
      value: player.id,
      label: `${playerLabel(player)} · ${playerObservationLabel(player)}`,
      group: player.playFabId ? `Identified` : `Anonymous`
    }))
  ]
</script>

<aside class="roster" aria-label="Recorded player tracks">
  <div class="roster-heading"><strong>Players</strong><span>{players.length} tracks</span></div>
  <Input type="search" value={query} onChange={value => query = value} placeholder="Name or ID" label="Search players" />
  <div class="roster-list">
    <div class:chosen={selectedPlayerId === null}>
      <ListRow title="All players" subtitle="Server activity" variant="compact" selected={selectedPlayerId === null} onClick={() => onSelect(null)} />
    </div>
    {#each matches as player (player.id)}
      <div class:chosen={selectedPlayerId === player.id}>
        <ListRow title={playerLabel(player)} variant="compact" selected={selectedPlayerId === player.id} onClick={() => onSelect(player.id)}>
          <Avatar slot="leading" name={playerLabel(player)} />
          <span slot="meta" class="presence" class:departed={!player.present}>
            <i aria-hidden="true"></i>{playerObservationLabel(player)}
          </span>
        </ListRow>
      </div>
    {/each}
    {#if !matches.length}<p>No players match this search.</p>{/if}
  </div>
  {#if page > 1 || hasNext}
    <PaginationControls currentPage={page} totalPages={null} hasPrevious={page > 1} {hasNext}
      onPrevious={() => onPage(page - 1)} onNext={() => onPage(page + 1)} />
  {/if}
</aside>
<div class="player-picker">
  <Select label="Follow player" value={selectedPlayerId ?? `all`} {options} searchable
    onChange={value => onSelect(value === `all` ? null : value)} />
  {#if page > 1 || hasNext}
    <PaginationControls currentPage={page} totalPages={null} hasPrevious={page > 1} {hasNext}
      onPrevious={() => onPage(page - 1)} onNext={() => onPage(page + 1)} />
  {/if}
</div>

<style lang="scss">
  .roster { min-height: 0; display: grid; grid-template-rows: auto auto minmax(0, 1fr); gap: 14px; }
  .roster-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .roster-heading strong { font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); }
  .roster-heading span, p { color: var(--color-light-tertiary); font-size: var(--font-size-xs); }
  .roster-list { display: grid; align-content: start; gap: 6px; overflow-y: auto; padding-right: 4px; }
  .chosen { --player-row-border: var(--color-accent-primary); --player-row-background: #{rgbaa(var(--color-accent-primary), 0.09)}; }
  .presence { display: flex; align-items: center; gap: 5px; color: var(--color-light-tertiary); font-size: var(--font-size-xs); }
  .presence i { width: 5px; height: 5px; border-radius: 50%; background: var(--color-accent-secondary); }
  .departed i { background: var(--color-light-tertiary); }
  .player-picker { display: none; min-width: 0; }
  @container telemetry (max-width: 759px) {
    .roster { display: none; }
    .player-picker { display: block; }
  }
</style>
