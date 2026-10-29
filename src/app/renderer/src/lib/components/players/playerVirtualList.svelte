<script lang="ts">
  import { createVirtualizer } from '@tanstack/svelte-virtual'
  import { onDestroy, tick } from 'svelte'
  import { get } from 'svelte/store'
  import type { PlayerState } from '$lib/types/playerState'
  import { getPlayerScrollAnchor, getPlayerScrollOffset, playerVirtualRows, type PlayerScrollAnchor } from './playerVirtualWindow'

  export let players: PlayerState[]
  export let scrollElement: HTMLElement | undefined
  export let pinnedKeys: readonly string[] = []
  export let getKey: (player: PlayerState) => string

  let rowGap = 0
  let list: HTMLDivElement
  let restoration = 0
  const virtualizer = createVirtualizer<HTMLElement, HTMLDivElement>({
    ...playerVirtualRows(players, getKey, pinnedKeys),
    getScrollElement: () => scrollElement ?? null
  })
  onDestroy(() => restoration++)

  $: if (scrollElement) rowGap = Number.parseFloat(getComputedStyle(scrollElement).rowGap) || 0
  $: get(virtualizer).setOptions({
    ...playerVirtualRows(players, getKey, pinnedKeys),
    getScrollElement: () => scrollElement ?? null,
    gap: rowGap
  })
  $: virtualRows = $virtualizer.getVirtualItems()
  $: totalSize = $virtualizer.getTotalSize()

  export function getAnchor(): PlayerScrollAnchor | null {
    return scrollElement ? getPlayerScrollAnchor(get(virtualizer), scrollElement.scrollTop) : null
  }

  export async function restoreAnchor(anchor: PlayerScrollAnchor | null, fallbackTop: number): Promise<void> {
    const version = ++restoration
    for (let attempt = 0; attempt < 3; attempt++) {
      await tick()
      if (version !== restoration || !scrollElement) return
      const instance = get(virtualizer)
      instance.scrollToOffset(getPlayerScrollOffset(instance, anchor, fallbackTop), { behavior: `auto` })
      await tick()
      // Allow native scroll and row measurements to settle before correcting the anchor.
      await new Promise<void>(resolve => setTimeout(resolve, 20))
      if (version !== restoration || !list?.isConnected) return
      for (const row of list.querySelectorAll<HTMLDivElement>(`[data-player-key]`)) instance.measureElement(row)
    }
  }

  function measureRow(node: HTMLDivElement, _index: number) {
    get(virtualizer).measureElement(node)
    return {
      update: () => get(virtualizer).measureElement(node),
      destroy: () => get(virtualizer).measureElement(null)
    }
  }

  function observeWidth(node: HTMLDivElement) {
    let width = node.getBoundingClientRect().width
    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = entry.contentRect.width
      if (nextWidth === width) return
      width = nextWidth
      const anchor = getAnchor()
      const top = scrollElement?.scrollTop ?? 0
      get(virtualizer).measure()
      for (const row of node.querySelectorAll<HTMLDivElement>(`[data-player-key]`)) get(virtualizer).measureElement(row)
      void restoreAnchor(anchor, top)
    })
    observer.observe(node)
    return { destroy: () => observer.disconnect() }
  }
</script>

<div bind:this={list} class="player-virtual-list" style:height={`${totalSize}px`} use:observeWidth>
  {#each virtualRows as row (row.key)}
    <div
      class="player-virtual-list__row"
      data-index={row.index}
      data-player-key={getKey(players[row.index])}
      style:transform={`translateY(${row.start}px)`}
      use:measureRow={row.index}
    >
      <slot player={players[row.index]} />
    </div>
  {/each}
</div>

<style>
  .player-virtual-list { position: relative; width: 100%; overflow-anchor: none; }
  .player-virtual-list__row { position: absolute; top: 0; left: 0; width: 100%; }
</style>
