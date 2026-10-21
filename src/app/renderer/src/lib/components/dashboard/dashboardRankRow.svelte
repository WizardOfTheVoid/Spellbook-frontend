<script lang="ts">
  import ListRow from '$lib/components/ui/ListRow.svelte'
  import Avatar from '$lib/components/ui/avatar.svelte'
  import ProgressBar from '$lib/components/ui/progressBar.svelte'
  import AnimatedNumber from '$lib/components/ui/animatedNumber.svelte'
  import { dataChange } from '$lib/utils/dataChange'
  import { celebrateElement } from '$lib/utils/celebrate'
  import { dashboardRankCelebration } from './dashboardRankCelebration'
  import type { DashboardRank } from './dashboardViewModel'
  let { row, maximum, viewerId, scopeKey = `` }: { row: DashboardRank, maximum: number, viewerId: string, scopeKey?: string } = $props()
  let element: HTMLDivElement
</script>

<div class="rank" bind:this={element} use:dashboardRankCelebration={{ id: row.id, rank: row.rank, scopeKey }} class:rank--you={row.id === viewerId} class:rank--podium={row.rank <= 3} class:rank--first={row.rank === 1} style:--medal-color={row.rank === 1 ? `var(--color-rank-gold)` : row.rank === 2 ? `var(--color-rank-silver)` : `var(--color-rank-bronze)`}>
  <ListRow title={row.name} selected={row.id === viewerId} variant="compact" onClick={row.rank === 1 ? () => celebrateElement(element) : null}>
    <svelte:fragment slot="leading"><span class="position" use:dataChange={row.rank} role={row.rank === 1 ? `img` : undefined} aria-label={row.rank === 1 ? `Rank 1` : undefined}>{#if row.rank === 1}<i class="fa-solid fa-crown" aria-hidden="true"></i>{:else}{row.rank}{/if}</span><Avatar name={row.name} src={row.avatar} /></svelte:fragment>
    <svelte:fragment slot="title">{row.name}{#if row.id === viewerId}<span class="you"> (you)</span>{/if}</svelte:fragment>
    <svelte:fragment slot="trailing"><div class="activity"><ProgressBar value={row.count} max={maximum} label={`${row.name}: ${row.count} actions`} /><b><AnimatedNumber value={row.count} /></b></div></svelte:fragment>
  </ListRow>
</div>

<style lang="scss">
  .rank { min-width: 0; height: 100%; }
  .rank :global(.list-row) { height: 100%; min-height: 0; }
  .position { display: grid; place-items: center; width: 26px; height: 26px; flex: 0 0 26px; color: var(--color-light-tertiary); font-variant-numeric: tabular-nums; }
  .position i { font-size: var(--font-size-label); }
  .rank--podium .position { color: var(--medal-color); font-weight: var(--font-weight-heavy); border: 1px solid color-mix(in srgb, var(--medal-color) 45%, transparent); background: color-mix(in srgb, var(--medal-color) 10%, transparent); border-radius: 50%; }
  .rank--podium :global(.list-row) { border-color: color-mix(in srgb, var(--medal-color) 15%, transparent); background: color-mix(in srgb, var(--medal-color) 3%, transparent); }
  .rank--podium b { color: var(--medal-color); }
  .rank--first :global(.list-row) { border-color: color-mix(in srgb, var(--medal-color) 42%, transparent); background: linear-gradient(100deg, color-mix(in srgb, var(--medal-color) 10%, transparent), transparent); }
  .rank--first :global(.list-row__title), .rank--first b { color: var(--medal-color); font-weight: var(--font-weight-heavy); }
  .you { color: var(--color-accent-primary); font-size: var(--font-size-caption); margin-left: 3px; }
  .rank--you :global(.list-row__title) { color: var(--color-accent-primary); }
  .rank--first :global(.list-row__title strong) { color: var(--medal-color); font-weight: var(--font-weight-heavy); }
  .activity { display: flex; gap: 12px; align-items: center; width: 150px; }
  .activity :global(.progress-bar) { flex: 1; height: 5px; }
  b { width: 45px; text-align: right; font-size: var(--font-size-xs); font-variant-numeric: tabular-nums; }
  @container (max-width: 420px) { .activity { width: 95px; gap: 8px; } }
</style>
