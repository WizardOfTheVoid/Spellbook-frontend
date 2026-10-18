<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { timezone, formatActionTime } from '$lib/settings/timezone'
  import PanelHeader from '$lib/components/ui/PanelHeader.svelte'
  import Button from '$lib/components/ui/Button.svelte'
  import EmptyState from '$lib/components/ui/EmptyState.svelte'
  import PaginationControls from '$lib/components/ui/PaginationControls.svelte'
  import DashboardRankRow from './dashboardRankRow.svelte'
  import { createDashboardLeaderboardState, type DashboardLeaderboardState } from './dashboardLeaderboardState'
  import type { DashboardDataSource, DashboardRankingKind } from './dashboardViewModel'
  let { kind, source, viewerId, onBack }: { kind: DashboardRankingKind, source: DashboardDataSource, viewerId: string, onBack: () => void } = $props()
  let boardState = $state<DashboardLeaderboardState>({ data: null, loading: true, error: null })
  const title = { admins: `Top admins`, teams: `Top teams`, active: `Most active` }
  const controller = untrack(() => createDashboardLeaderboardState({ kind, source, onChange: value => { boardState = value } }))
  onMount(() => {
    void controller.start()
    return controller.destroy
  })
</script>

<section class="leaderboard" aria-label={title[kind]}>
  <PanelHeader title={title[kind]} eyebrow="Global · Last 30 days" leadingIcon="fa-arrow-left" onLeading={onBack} leadingLabel="Back to Dashboard"><svelte:fragment slot="trailing"><Button label="Refresh" icon="fa-rotate-right" size="sm" disabled={boardState.loading} onClick={() => void controller.refresh()} /></svelte:fragment></PanelHeader>
  <div class="content" aria-busy={boardState.loading}>
    {#if boardState.error}<p role="alert">{boardState.error}</p>{/if}
    {#if boardState.data}
      <small>Snapshot · {formatActionTime(boardState.data.asOf, $timezone)}</small>
      {#each boardState.data.rows as row (row.id)}<DashboardRankRow {row} maximum={boardState.data.rows[0]?.count ?? 0} {viewerId} />{/each}
      {#if !boardState.data.rows.length}<EmptyState title="No contributions yet" message="Recorded actions will appear here." />{/if}
      <PaginationControls currentPage={boardState.data.page} totalPages={Math.ceil(boardState.data.total / boardState.data.pageSize)} hasPrevious={boardState.data.page > 1} hasNext={boardState.data.page * boardState.data.pageSize < boardState.data.total} disabled={boardState.loading} onPrevious={() => void controller.setPage(boardState.data!.page - 1)} onNext={() => void controller.setPage(boardState.data!.page + 1)} />
    {:else}<EmptyState title={boardState.error ? `Ranking unavailable` : `Loading ranking`} message="Fetching the selected contribution snapshot." />{/if}
  </div>
</section>

<style lang="scss">
  .leaderboard { display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 20px; height: 100%; min-height: 0; padding-top: 26px; }
  .content { overflow-y: auto; min-height: 0; padding: 0 30px 30px; display: grid; align-content: start; gap: 6px; }
  small { color: var(--color-light-tertiary); font-size: 11px; margin-bottom: 12px; }
  p { font-size: 12px; color: var(--color-danger); }
</style>
