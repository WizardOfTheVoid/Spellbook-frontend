<script lang="ts">
  import { onMount } from 'svelte'
  import type { FilterChip } from '$lib/types/ui'
  import type { PlayerFilterState } from '$lib/utils/playerArchive'
  import { containModalTab } from '$lib/utils/quickActionUi'
  import Icon from '$lib/components/ui/Icon.svelte'
  import AdvancedPlayerFilters from './AdvancedPlayerFilters.svelte'

  export let filters: PlayerFilterState
  export let chips: FilterChip[]
  export let selectedChipIds: string[]
  export let count: number
  export let onChange: (filters: PlayerFilterState) => void
  export let onToggleChip: (id: string) => void
  export let onClose: () => void

  let dialog: HTMLDivElement
  let closeButton: HTMLButtonElement
  let closing = false

  function close(): void {
    if (closing) return
    closing = true
    if (typeof SFX !== `undefined`) SFX.play(`close`)
    onClose()
  }

  onMount(() => {
    const returnFocus = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === `Escape`) close()
      containModalTab(event, dialog, document.activeElement)
    }
    const handleOutsidePointer = (event: PointerEvent) => {
      if (!dialog.contains(event.target as Node)) close()
    }
    window.addEventListener(`keydown`, handleKeydown)
    window.addEventListener(`pointerdown`, handleOutsidePointer, true)
    closeButton.focus()
    return () => {
      window.removeEventListener(`keydown`, handleKeydown)
      window.removeEventListener(`pointerdown`, handleOutsidePointer, true)
      if (returnFocus?.isConnected) returnFocus.focus()
    }
  })
</script>

<div class="player-filters-modal">
  <button type="button" class="player-filters-modal__backdrop" aria-label="Close filters" tabindex="-1" data-uisfx-ignore="true" on:click={close}></button>
  <div id="player-filters-dialog" class="player-filters-modal__dialog" bind:this={dialog} role="dialog" aria-modal="true" aria-labelledby="player-filters-title" tabindex="-1">
    <header>
      <Icon name="fa-filter" size="lg" />
      <span class="player-filters-modal__title">
        <h2 id="player-filters-title">Filters</h2>
        <small>Narrow down players with specific criteria</small>
      </span>
      {#if count}<span class="player-filters-modal__count">{count} active</span>{/if}
      <button bind:this={closeButton} type="button" class="player-filters-modal__close" aria-label="Close filters" data-uisfx-ignore="true" on:click={close}><Icon name="fa-xmark" size="sm" /></button>
    </header>
    <div class="player-filters-modal__body">
      <AdvancedPlayerFilters {filters} {chips} {selectedChipIds} {onChange} {onToggleChip} />
    </div>
  </div>
</div>

<style lang="scss">
  .player-filters-modal { position: absolute; inset: 0; z-index: calc(var(--z-popover) + 2); display: grid; place-items: start center; padding: var(--gutter); }
  .player-filters-modal__backdrop { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; border-radius: 0; background: rgbaa(var(--color-dark-primary), 0.25); }
  .player-filters-modal__dialog { box-sizing: border-box; position: relative; width: min(680px, 100%); max-height: calc(100% - var(--gutter)); display: grid; grid-template-rows: auto minmax(0, 1fr); overflow: hidden; border: 1px solid var(--color-dark-tertiary); border-radius: var(--radius-xl); background: var(--color-dark-primary); box-shadow: var(--shadow); }
  header { display: flex; align-items: center; gap: var(--gutter-md); border-bottom: 1px solid var(--color-dark-secondary); padding: var(--gutter-md); }
  header > :global(.icon) { color: var(--color-light-primary); }
  .player-filters-modal__title { min-width: 0; flex: 1; display: grid; gap: 3px; }
  h2 { margin: 0; font-size: var(--font-size-lg); }
  small { color: var(--color-light-tertiary); font-size: var(--font-size-xs); }
  .player-filters-modal__count { border: 1px solid var(--color-accent-secondary); border-radius: var(--radius); padding: var(--gutter-sm); color: var(--color-accent-secondary); font-size: var(--font-size-xs); white-space: nowrap; }
  .player-filters-modal__close { width: var(--control-height-sm); height: var(--control-height-sm); display: grid; place-items: center; border: 1px solid var(--color-dark-tertiary); border-radius: var(--radius); background: transparent; color: var(--color-light-primary); }
  .player-filters-modal__body { min-height: 0; overflow: auto; padding: var(--gutter-lg); }
</style>
