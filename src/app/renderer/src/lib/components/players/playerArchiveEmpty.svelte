<script lang="ts">
  import { asset } from '$app/paths'
  import Button from '$lib/components/ui/Button.svelte'
  import EmptyState from '$lib/components/ui/EmptyState.svelte'
  export let onClearFilters: () => void
  export let onResetSearch: () => void
</script>

<div class="player-archive-empty">
  <div class="player-archive-empty__art" aria-hidden="true">
    <img src={asset('/graphics/animated_no_results_icon_v3.svg')} alt="" width="272" height="202" />
  </div>
  <div class="player-archive-empty__copy">
    <EmptyState title="No players match these filters" message="Try removing some filters or changing your search." />
  </div>
  <div class="player-archive-empty__actions">
    <Button label="Clear filters" icon="fa-filter" variant="primary" onClick={onClearFilters} />
    <Button label="Reset search" icon="fa-rotate-left" onClick={onResetSearch} />
  </div>
</div>

<style lang="scss">
  .player-archive-empty { min-height: 360px; display: grid; align-content: center; justify-items: center; gap: var(--gutter-md); padding: var(--gutter-lg) var(--gutter-md); text-align: center; }
  .player-archive-empty__art { width: min(272px, 100%); }
  .player-archive-empty__art img { display: block; width: 100%; height: auto; }
  .player-archive-empty__copy { width: min(535px, 100%); }
  .player-archive-empty__actions { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--gutter-sm); margin-top: var(--gutter-md); }
</style>
