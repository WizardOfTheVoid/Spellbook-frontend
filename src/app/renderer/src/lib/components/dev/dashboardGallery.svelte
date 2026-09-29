<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte'
  import Select from '$lib/components/ui/Select.svelte'
  import AnimatedNumber from '$lib/components/ui/animatedNumber.svelte'
  import DashboardScopeControls from '$lib/components/dashboard/dashboardScopeControls.svelte'
  import DashboardMoneyCard from '$lib/components/dashboard/dashboardMoneyCard.svelte'
  import DashboardStatCard from '$lib/components/dashboard/dashboardStatCard.svelte'
  import DashboardActionBreakdown from '$lib/components/dashboard/dashboardActionBreakdown.svelte'
  import DashboardLiveStrip from '$lib/components/dashboard/dashboardLiveStrip.svelte'
  import DashboardRankRow from '$lib/components/dashboard/dashboardRankRow.svelte'
  import DashboardRankingCard from '$lib/components/dashboard/dashboardRankingCard.svelte'
  import DashboardProtectionCard from '$lib/components/dashboard/dashboardProtectionCard.svelte'
  import DashboardSparkline from '$lib/components/dashboard/dashboardSparkline.svelte'
  import DashboardTimeline from '$lib/components/dashboard/dashboardTimeline.svelte'
  import DashboardTimelineNavigator from '$lib/components/dashboard/dashboardTimelineNavigator.svelte'
  import DashboardTimelineValues from '$lib/components/dashboard/dashboardTimelineValues.svelte'
  import DashboardLeaderboardView from '$lib/components/dashboard/dashboardLeaderboardView.svelte'
  import DashboardPreview from '$lib/components/dashboard/preview/dashboardPreview.svelte'
  import { createDashboardPreviewData, createDashboardPreviewTimeline, dashboardPreviewScenarios, type DashboardPreviewScenario } from '$lib/components/dashboard/preview/dashboardPreviewData'
  import { createDashboardPreviewSource } from '$lib/components/dashboard/preview/dashboardPreviewSource'
  import { createDashboardPresentation } from '$lib/components/dashboard/dashboardPresentation'
  import { dashboardSeriesColor } from '$lib/components/dashboard/dashboardTimelineData'
  import { profileCommandAppearance } from '$lib/utils/profileActions'
  import { dashboardTimeRange, rescopeDashboardTimeline } from '$lib/components/dashboard/dashboardTimelineRange'
  import { dashboardQueryKey, defaultDashboardQuery, type DashboardEntity, type DashboardTimeRange, type DashboardTimelineQuery, type DashboardViewQuery } from '$lib/components/dashboard/dashboardViewModel'

  let scenario = $state<DashboardPreviewScenario>(`normal`)
  let query = $state<DashboardViewQuery>({ ...defaultDashboardQuery })
  let sampleTick = $state(0)
  let selected = $state(``)
  let selectedRange = $state<DashboardTimeRange | null>(null)
  let leaderboardOpen = $state(false)
  let previewOpen = $state(false)
  const scenarios = dashboardPreviewScenarios.filter(option => ![`loading`, `error`, `stale`].includes(option.value))
  const data = $derived(createDashboardPreviewData(query, scenario, sampleTick))
  const presentation = $derived(createDashboardPresentation(data, new Date(data.generatedAt)))
  const range = $derived(selectedRange ?? dashboardTimeRange(data.timeline, query.period))
  const values = $derived(rescopeDashboardTimeline(data.timeline, range, 12))
  const source = $derived.by(() => {
    const currentScenario = scenario
    const currentTick = sampleTick
    return {
      ...createDashboardPreviewSource(currentScenario),
      loadTimeline: async (request: DashboardTimelineQuery) => createDashboardPreviewTimeline(request, currentScenario, currentTick)
    }
  })

  function changeQuery(next: DashboardViewQuery) {
    query = next
    selectedRange = null
  }

  function changeScenario(next: string) {
    scenario = next as DashboardPreviewScenario
    sampleTick = 0
    selected = ``
    selectedRange = null
    if (scenario === `noTeam` && query.environment === `team`) query = { ...query, environment: `global` }
  }

  const openEntity = (entity: DashboardEntity) => { selected = `Selected sample: ${entity.name}` }
</script>

<div class="dashboard-gallery">
  <p>Dashboard components with local sample data. Apply updates to inspect counting, green change feedback and moving ranks.</p>
  <div class="controls">
    <Select label="Dashboard example" value={scenario} options={scenarios} onChange={changeScenario} />
    <Button label="Apply sample update" icon="fa-bolt" size="sm" onClick={() => sampleTick += 5} />
    <Button label="Reset sample updates" icon="fa-rotate-left" size="sm" onClick={() => sampleTick = 0} />
  </div>
  {#if selected}<p role="status">{selected}</p>{/if}

  <section>
    <h3>Scope controls</h3>
    <code>dashboardScopeControls.svelte</code>
    <DashboardScopeControls {query} teams={data.teams} onChange={changeQuery} />
  </section>

  <section>
    <h3>Animated number / change feedback</h3>
    <code>animatedNumber.svelte · dataChange</code>
    <div class="numbers"><strong><AnimatedNumber value={data.metrics.actions} /></strong><strong><AnimatedNumber value={data.metrics.money} formatValue={presentation.currency} /></strong></div>
  </section>

  <section>
    <h3>Money card</h3>
    <code>dashboardMoneyCard.svelte</code>
    <DashboardMoneyCard metrics={data.metrics} currency={presentation.currency} count={presentation.count} />
  </section>

  <section>
    <h3>Statistic cards</h3>
    <code>dashboardStatCard.svelte · default and impact variants</code>
    <div class="cards">
      <DashboardStatCard label="Actions performed" value={data.metrics.actions} caption="Default variant" icon="fa-bolt" animate />
      <DashboardStatCard label="Cheater bans" value={data.metrics.cheaterBans} caption="Keeping the fight fair" icon={profileCommandAppearance.ban.icon} iconType="light" iconColor={dashboardSeriesColor(`ban`)} variant="impact" tone="danger" animate />
      <DashboardStatCard label="Protected servers" value={data.metrics.servers} caption="Getting some community love" icon="fa-server" variant="impact" tone="blue" animate />
    </div>
  </section>

  <section>
    <h3>Action breakdown</h3>
    <code>dashboardActionBreakdown.svelte</code>
    <DashboardActionBreakdown totals={data.breakdown} count={presentation.count} />
  </section>

  <section>
    <h3>Live strip</h3>
    <code>dashboardLiveStrip.svelte · admins, players and latest action</code>
    <DashboardLiveStrip live={data.live} age={presentation.age} onOpen={openEntity} />
  </section>

  <section>
    <h3>Rank rows</h3>
    <code>dashboardRankRow.svelte · crown, silver, bronze and regular ranks</code>
    <div class="rank-rows">{#each data.scoreboards.admins.slice(0, 4) as row (row.id)}<DashboardRankRow {row} maximum={data.scoreboards.admins[0]?.count ?? 0} viewerId={data.viewerId} scopeKey={dashboardQueryKey(query)} />{/each}</div>
  </section>

  <section>
    <h3>Ranking cards / protected server</h3>
    <code>dashboardRankingCard.svelte · dashboardProtectionCard.svelte</code>
    <div class="cards">
      <DashboardRankingCard title="Top admins" rows={data.scoreboards.admins} viewerId={data.viewerId} viewerRank={data.scoreboards.viewerRank.admins} scopeKey={dashboardQueryKey(query)} />
      <DashboardRankingCard title="Most active" rows={data.scoreboards.active} viewerId={data.viewerId} viewerRank={data.scoreboards.viewerRank.active} scopeKey={dashboardQueryKey(query)} />
      <DashboardRankingCard title="Top teams" rows={data.scoreboards.teams} viewerId={data.viewerId} scopeKey={dashboardQueryKey(query)} />
      <DashboardProtectionCard protection={data.scoreboards.protection} onOpen={openEntity} />
    </div>
  </section>

  <section>
    <h3>Canvas sparkline</h3>
    <code>dashboardSparkline.svelte · cumulative activity and missing history</code>
    <div class="cards"><DashboardSparkline values={data.metrics.moneySeries} label="Sample cumulative account value" /><DashboardSparkline values={[3, 5, null, null, 8, 12, 10, 16]} label="Sample activity with missing history" /></div>
  </section>

  <section>
    <h3>Timeline / Canvas bars and lines</h3>
    <code>dashboardTimeline.svelte · dashboardCanvasBars.svelte · dashboardCanvasLines.svelte</code>
    <p>Switch tabs for both renderers, toggle message series, inspect tooltips and drag the time window.</p>
    {#key `${dashboardQueryKey(query)}:${scenario}`}<DashboardTimeline timeline={data.timeline} {source} {query} caption={presentation.scope} onSelect={timeline => changeQuery({ ...query, timeline })} />{/key}
  </section>

  <section>
    <h3>Timeline navigator / value table</h3>
    <code>dashboardTimelineNavigator.svelte · dashboardTimelineValues.svelte</code>
    <DashboardTimelineNavigator timeline={data.timeline} {range} onChange={next => selectedRange = next} />
    <DashboardTimelineValues timeline={values} />
  </section>

  <section>
    <h3>Paginated leaderboard</h3>
    <code>dashboardLeaderboardView.svelte</code>
    <details bind:open={leaderboardOpen}><summary>Open leaderboard example</summary>
      {#if leaderboardOpen}{#key scenario}<div class="leaderboard-stage"><DashboardLeaderboardView kind="admins" {source} viewerId={data.viewerId} onBack={() => leaderboardOpen = false} /></div>{/key}{/if}
    </details>
  </section>

  <section>
    <h3>Complete dashboard view</h3>
    <code>dashboardView.svelte · dashboardPreview.svelte</code>
    <details bind:open={previewOpen}><summary>Open dashboard example</summary>
      {#if previewOpen}<div class="preview-stage"><DashboardPreview /></div>{/if}
    </details>
  </section>
</div>

<style lang="scss">
  .dashboard-gallery { display: grid; gap: var(--gutter-lg); min-width: 0; container: dashboard / inline-size; }
  section { display: grid; gap: var(--gutter-sm); min-width: 0; }
  h3 { margin: 0; font-size: var(--font-size-label); color: var(--color-light-primary); }
  p, code { margin: 0; font-size: var(--font-size-xs); color: var(--color-light-tertiary); }
  code { overflow-wrap: anywhere; }
  .controls, .numbers { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gutter-md); }
  .controls :global(.ui-select) { width: min(240px, 100%); }
  .numbers strong { font-size: var(--font-size-xl); }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: var(--gutter-md); }
  .rank-rows { display: grid; grid-auto-rows: 38px; gap: calc(var(--gutter-sm) / 2); container-type: inline-size; }
  summary { cursor: pointer; color: var(--color-light-secondary); font-size: var(--font-size-xs); }
  summary:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: calc(var(--gutter-sm) / 2); }
  .preview-stage, .leaderboard-stage { margin-top: var(--gutter-md); height: 620px; min-width: 0; overflow: hidden; border: 1px solid var(--color-dark-secondary); border-radius: var(--radius); background: var(--color-dark-primary); }
</style>
