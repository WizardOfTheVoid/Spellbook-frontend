<script lang="ts">
  import { createVirtualizer } from '@tanstack/svelte-virtual'
  import { get } from 'svelte/store'
  import { onDestroy, tick } from 'svelte'
  import { getPlayerScrollAnchor, getPlayerScrollOffset } from '../players/playerVirtualWindow'
  import { actionEventsVirtualOptions } from './actionEventsVirtual'
  import type { ActionEvent, ActionEventsAnchor } from './actionEventsTypes'

  export let items: ActionEvent[]
  export let scrollElement: HTMLElement | undefined
  export let pinnedIds: number[] = []
  let list: HTMLDivElement
  let restoration = 0
  const virtualizer = createVirtualizer<HTMLElement, HTMLDivElement>({ ...actionEventsVirtualOptions(items, pinnedIds), getScrollElement: () => scrollElement ?? null })
  $: get(virtualizer).setOptions({ ...actionEventsVirtualOptions(items, pinnedIds), getScrollElement: () => scrollElement ?? null })
  $: rows = $virtualizer.getVirtualItems()
  $: totalSize = $virtualizer.getTotalSize()
  onDestroy(() => restoration++)

  export function getAnchor(): ActionEventsAnchor | null {
    return scrollElement ? getPlayerScrollAnchor(get(virtualizer), scrollElement.scrollTop) : null
  }

  export async function restoreAnchor(anchor: ActionEventsAnchor | null, top = 0): Promise<void> {
    const version = ++restoration
    for (let attempt = 0; attempt < 3; attempt++) {
      await tick()
      if (version !== restoration || !scrollElement?.isConnected) return
      get(virtualizer).scrollToOffset(getPlayerScrollOffset(get(virtualizer), anchor, top), { behavior: `auto` })
      await tick()
      if (version !== restoration || !list?.isConnected) return
      for (const node of list.querySelectorAll<HTMLDivElement>(`[data-index]`)) get(virtualizer).measureElement(node)
    }
  }

  function measureRow(node: HTMLDivElement, _index: number) {
    get(virtualizer).measureElement(node)
    return { update: () => get(virtualizer).measureElement(node), destroy: () => get(virtualizer).measureElement(null) }
  }

  function observeWidth(node: HTMLDivElement) {
    let width = node.getBoundingClientRect().width
    const observer = new ResizeObserver(([entry]) => {
      if (width === entry.contentRect.width) return
      width = entry.contentRect.width
      const anchor = getAnchor()
      const top = scrollElement?.scrollTop ?? 0
      get(virtualizer).measure()
      void restoreAnchor(anchor, top)
    })
    observer.observe(node)
    return { destroy: () => observer.disconnect() }
  }
</script>

<div bind:this={list} class="action-events-virtual" style:height={`${totalSize}px`} use:observeWidth>
  {#each rows as row (row.key)}
    <div class="action-events-virtual__row" data-index={row.index} style:transform={`translateY(${row.start}px)`} use:measureRow={row.index}>
      <slot event={items[row.index]} />
    </div>
  {/each}
</div>

<style>
  .action-events-virtual { position: relative; width: 100%; overflow-anchor: none; }
  .action-events-virtual__row { position: absolute; top: 0; left: 0; width: 100%; }
</style>
