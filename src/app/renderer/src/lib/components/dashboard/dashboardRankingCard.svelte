<script lang="ts">
  import DashboardRankRow from './dashboardRankRow.svelte'
  import { flip } from 'svelte/animate'
  import { prefersReducedMotion } from 'svelte/motion'
  import { rankDashboardRows } from './dashboardRanking'
  import { cssDuration } from '$lib/utils/cssDuration'
  import type { DashboardRank } from './dashboardViewModel'
  let { title, rows, viewerId, viewerRank, scopeKey = `` }: { title: string, rows: readonly DashboardRank[], viewerId: string, viewerRank?: DashboardRank, scopeKey?: string } = $props()
  const ranked = $derived(rankDashboardRows(rows))
  function moveRow(node: HTMLElement, rects: { from: DOMRect, to: DOMRect }) {
    return flip(node, rects, { duration: prefersReducedMotion.current ? 0 : cssDuration(getComputedStyle(node), `--motion-base`) })
  }
</script>

<article class="ranking">
  <header><h2>{title}</h2></header>
  {#if rows.length}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (Scrollable rankings must support keyboard scrolling.) -->
    <div class="rows" role="region" aria-label={`${title} rankings`} tabindex="0">{#each ranked as row (row.id)}<div class="ranking-row" animate:moveRow><DashboardRankRow {row} maximum={ranked[0].count} {viewerId} {scopeKey} /></div>{/each}</div>
  {:else}<p class="empty">No contenders yet. The crown's up for grabs.</p>{/if}
  {#if viewerRank && !rows.some(row => row.id === viewerId)}<p class="footer">Your rank: #{viewerRank.rank} · {viewerRank.count.toLocaleString(`en-US`)} actions</p>{/if}
</article>

<style lang="scss">
  .ranking { --ranking-row-height: 38px; --ranking-row-gap: 4px; min-width: 0; padding: 12px 14px; border: 1px solid var(--color-dark-secondary); border-radius: var(--radius); background: rgbaa(var(--color-dark-primary), .34); container-type: inline-size; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
  h2 { font-size: var(--font-size-label); font-weight: var(--font-weight-bold); margin: 0; }
  .rows { display: grid; grid-auto-rows: var(--ranking-row-height); gap: var(--ranking-row-gap); max-height: calc(5 * var(--ranking-row-height) + 4 * var(--ranking-row-gap)); overflow: auto; overscroll-behavior: contain; }
  .ranking-row { min-width: 0; }
  .rows:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 3px; }
  .empty { display: grid; align-items: center; min-height: 150px; color: var(--color-light-tertiary); font-size: var(--font-size-xs); }
  .footer { margin: 7px 0 0; color: var(--color-light-tertiary); font-size: var(--font-size-caption); }
</style>
