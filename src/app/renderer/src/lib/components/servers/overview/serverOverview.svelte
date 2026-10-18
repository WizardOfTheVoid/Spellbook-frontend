<script lang="ts">
  import { onMount } from 'svelte'
  import type { GameServerRecord } from '$lib/core'
  import type { ServerHistoryPeriod } from '@spellbook/shared/gameServerOverview'
  import type { ServerLiveSummary } from '@spellbook/shared/serverStore'
  import { getServerOverview, getServerAdmins } from '$lib/utils/gameServersApi'
  import { createServerOverviewState, type ServerOverviewState } from './serverOverviewState'
  import { serverInformationFields, serverPopulationTimeline } from './serverOverviewPresentation'
  import Button from '$lib/components/ui/Button.svelte'
  import Select from '$lib/components/ui/Select.svelte'
  import Avatar from '$lib/components/ui/avatar.svelte'
  import ListRow from '$lib/components/ui/ListRow.svelte'
  import Tile from '$lib/components/ui/Tile.svelte'
  import TileGrid from '$lib/components/ui/TileGrid.svelte'
  import InfoNotice from '$lib/components/ui/infoNotice.svelte'
  import EmptyState from '$lib/components/ui/EmptyState.svelte'
  import DashboardStatCard from '$lib/components/dashboard/dashboardStatCard.svelte'
  import DashboardActionBreakdown from '$lib/components/dashboard/dashboardActionBreakdown.svelte'
  import DashboardTimeline from '$lib/components/dashboard/dashboardTimeline.svelte'

  let { server, live, active = true }: { server: GameServerRecord, live: ServerLiveSummary | null, active?: boolean } = $props()
  let period = $state<ServerHistoryPeriod>(`day`)
  let viewState = $state.raw<ServerOverviewState>({ data: null, loading: false, error: null, adminsLoading: false, adminsError: null })
  let mounted = $state(false)
  let expandedAdmins = $state(false)
  const controller = createServerOverviewState({ overview: getServerOverview, admins: getServerAdmins }, value => { viewState = value })
  const periods = [{ value: `day`, label: `Last 24 hours` }, { value: `week`, label: `Last 7 days` }, { value: `month`, label: `Last 30 days` }]
  const actions = [`bans`, `kicks`, `warnings`, `unbans`] as const
  const count = (value: number | null) => value === null ? `—` : value.toLocaleString()
  const data = $derived(viewState.data)
  const admins = $derived(data?.admins.items ?? [])
  const average = $derived(data?.population.average?.toLocaleString(undefined, { maximumFractionDigits: 1 }) ?? `—`)
  const timeline = $derived(data ? serverPopulationTimeline(data.population) : null)
  const knownHistory = $derived(data?.population.buckets.some(bucket => bucket.value !== null))
  const fields = $derived(serverInformationFields(server, live))
  onMount(() => {
    mounted = true
    const timer = window.setInterval(() => { void controller.refresh() }, 15000)
    return () => {
      window.clearInterval(timer)
      controller.destroy()
    }
  })
  $effect(() => { if (mounted) controller.configure(server.id, period, active) })
</script>

<div class="server-overview">
  <div class="live-row">
    <DashboardStatCard label="Players now" value={`${live?.population.count ?? `—`} / ${live?.maxPlayers ?? server.maxPlayers ?? `—`}`} caption={live?.population.count === null || !live ? `Population unavailable` : `Current population`} />
    <DashboardStatCard label="Admins connected" value={data?.admins.total ?? null} caption={data && !admins.length ? `No admins currently connected.` : ``}>
      <div class="admin-list">
        {#each expandedAdmins ? admins : admins.slice(0, 3) as admin (admin.id)}
          <ListRow title={admin.name} variant="compact"><Avatar slot="leading" src={admin.avatar} name={admin.name} /></ListRow>
        {/each}
      </div>
      {#if admins.length > 3}<Button label={expandedAdmins ? `Show less` : `Show all (${data?.admins.total})`} size="sm" onClick={() => { expandedAdmins = !expandedAdmins }} />{/if}
      {#if expandedAdmins && data?.admins.hasMore}<Button label="Load more admins" size="sm" disabled={viewState.adminsLoading || viewState.loading} onClick={() => void controller.moreAdmins()} />{/if}
      {#if viewState.adminsError}<InfoNotice message={viewState.adminsError} />{/if}
    </DashboardStatCard>
  </div>

  <DashboardActionBreakdown totals={data?.moderation ?? {}} {count} {actions} />
  <div class="history-heading">
    <h2>Player count</h2>
    <Select label="History period" showLabel={false} value={period} options={periods} onChange={value => { period = value as ServerHistoryPeriod }} />
  </div>
  {#if viewState.error}
    <div class="refresh-error" role="status"><InfoNotice message={`${viewState.error}${data ? ` Showing the last update.` : ``}`} /><Button label="Retry" size="sm" disabled={viewState.loading} onClick={() => void controller.refresh()} /></div>
  {/if}
  <section aria-label="Population history" aria-busy={viewState.loading}>
    <DashboardStatCard label="Estimated average" value={average}>
      {#if timeline && knownHistory}<DashboardTimeline {timeline} label="Server population history" caption="Estimated average players per time interval" />
      {:else}<div class="chart-empty"><EmptyState title={viewState.loading ? `Loading history` : viewState.error ? `History unavailable` : `No population history`} message={viewState.loading ? `Fetching this server’s recorded population.` : `Population history is not available for this period.`} /></div>{/if}
      <InfoNotice message="Based on recorded directory counts. Counts are carried forward between changes; collection gaps may affect the estimate." />
    </DashboardStatCard>
  </section>
  <section class="server-information" aria-label="Server information">
    <h2>Server information</h2>
    <TileGrid>{#each fields as field}<Tile title={field.value ?? `—`} subtitle={field.label} />{/each}</TileGrid>
  </section>
</div>

<style lang="scss">
  .server-overview, .server-information { display: grid; gap: var(--gutter-lg); min-width: 0; }
  .live-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: var(--gutter-md); align-items: start; }
  .admin-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr)); gap: var(--gutter-sm); min-width: 0; }
  .history-heading, .refresh-error { display: flex; justify-content: space-between; align-items: center; gap: var(--gutter-md); min-width: 0; }
  .refresh-error { flex-wrap: wrap; }
  .history-heading > :global(.ui-select) { max-width: 200px; }
  h2 { margin: 0; font-size: var(--font-size-lg); font-weight: var(--font-weight-medium); }
  .chart-empty { min-height: 245px; display: grid; place-items: center; }
  @container server-detail (max-width: 540px) { .live-row { grid-template-columns: 1fr; } }
</style>
