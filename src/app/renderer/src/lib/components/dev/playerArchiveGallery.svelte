<script lang="ts">
  import { createDefaultPlayerFilters } from '$lib/utils/playerArchive'
  import { activePlayerFilterTags } from '$lib/utils/playerArchiveControls'
  import { getPlayerFilterChips, togglePlayerFilter } from '$lib/utils/playerFilters'
  import PlayerArchiveEmpty from '$lib/components/players/playerArchiveEmpty.svelte'
  import PlayerFiltersModal from '$lib/components/players/playerFiltersModal.svelte'

  let mode: `database` | `live` = `database`
  let modalOpen = false
  let filters = createDefaultPlayerFilters()
  let chipIds = [`low-rank`]
  let search = `Knight`

  $: chips = getPlayerFilterChips(mode)
  $: tags = activePlayerFilterTags(filters, [], chipIds)

  function openFilters(nextMode: typeof mode): void {
    mode = nextMode
    chipIds = nextMode === `database` ? [`low-rank`] : [`non-eu`]
    filters = createDefaultPlayerFilters()
    modalOpen = true
  }

  function clearFilters(): void {
    chipIds = []
    filters = createDefaultPlayerFilters()
  }
</script>

<div class="archive-gallery">
  <p>Both player sources open the same filter dialog. The empty result below uses the current demo filters and search.</p>
  <div class="archive-gallery__buttons">
    <button type="button" on:click={() => openFilters(`database`)}>Database filters</button>
    <button type="button" on:click={() => openFilters(`live`)}>Live server filters</button>
  </div>
  <code>{mode} · {tags.length} active filters · search: {search || `none`}</code>
  <div class="archive-gallery__stage">
    <div class="archive-gallery__empty">
      <PlayerArchiveEmpty onClearFilters={clearFilters} onResetSearch={() => { search = `` }} />
    </div>
    {#if modalOpen}
      <PlayerFiltersModal {filters} {chips} selectedChipIds={chipIds} count={tags.length} onChange={next => { filters = next }} onToggleChip={id => { chipIds = togglePlayerFilter(chipIds, id) }} onClose={() => { modalOpen = false }} />
    {/if}
  </div>
</div>

<style lang="scss">
  .archive-gallery { display: grid; gap: var(--gutter-md); }
  p { margin: 0; color: var(--color-light-tertiary); font-size: var(--font-size-xs); }
  .archive-gallery__buttons { display: flex; flex-wrap: wrap; gap: var(--gutter-sm); }
  button { min-height: var(--control-height-sm); border: 1px solid var(--color-dark-tertiary); border-radius: var(--radius); padding: 0 var(--gutter-md); background: var(--color-dark-primary); color: var(--color-light-primary); font-size: var(--font-size-xs); }
  code { color: var(--color-light-secondary); font-size: var(--font-size-xs); }
  .archive-gallery__stage { position: relative; width: min(520px, 100%); min-height: 420px; overflow: hidden; border: 1px solid var(--color-dark-secondary); border-radius: var(--radius); }
  .archive-gallery__empty { background: var(--color-dark-primary); }
</style>
