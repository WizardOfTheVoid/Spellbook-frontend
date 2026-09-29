<script lang="ts">
  import { EvilBarChart } from '$lib/components/evilcharts/charts/layerchart-bar-chart'
  import { EvilLineChart } from '$lib/components/evilcharts/charts/layerchart-line-chart'
  import TabbedListCard from './TabbedListCard.svelte'
  import EmptyState from '$lib/components/ui/EmptyState.svelte'
  import { timezone } from '$lib/settings/timezone'
  import { formatDateStamp } from '@spellbook/shared/dateFormatting'
  import DashboardCanvasBars from './dashboardCanvasBars.svelte'
  import DashboardCanvasLines from './dashboardCanvasLines.svelte'
  import DashboardTimelineNavigator from './dashboardTimelineNavigator.svelte'
  import { createDashboardChartData, dashboardHiddenSeries, selectDashboardTimeline, toggleDashboardSeries, withDashboardTimelineAverage } from './dashboardTimelineData'
  import { dashboardTimeRange, dashboardTimelineBudget, rescopeDashboardTimeline } from './dashboardTimelineRange'
  import { dashboardQueryKey, type DashboardDataSource, type DashboardTimelineData, type DashboardTimelineView, type DashboardTimeRange, type DashboardViewQuery } from './dashboardViewModel'
  let { timeline, source, query, caption, onSelect }: { timeline: DashboardTimelineData, source: DashboardDataSource, query: DashboardViewQuery, caption: string, onSelect: (view: DashboardTimelineView) => void } = $props()
  let selectedRange = $state.raw<DashboardTimeRange | null>(null)
  let loaded = $state.raw<{ key: string, data: DashboardTimelineData } | null>(null)
  let detailError = $state<string | null>(null)
  let chartWidth = $state(640)
  let hiddenSeries = $state<readonly string[]>([...dashboardHiddenSeries])
  const toggleSeries = (key: string) => hiddenSeries = toggleDashboardSeries(hiddenSeries, key)
  const range = $derived(selectedRange ?? dashboardTimeRange(timeline, query.period))
  const maxBuckets = $derived(dashboardTimelineBudget(chartWidth))
  const requestKey = $derived([dashboardQueryKey(query), range.start, range.end, maxBuckets].join(`:`))
  const visible = $derived(loaded?.key === requestKey ? loaded.data : rescopeDashboardTimeline(timeline, range, maxBuckets))
  const view = $derived(query.timeline)
  const plotted = $derived(view === `playerActions` ? selectDashboardTimeline(visible, hiddenSeries) : withDashboardTimelineAverage(visible))
  const overview = $derived(view === `playerActions` ? selectDashboardTimeline(timeline, hiddenSeries) : timeline)
  $effect(() => {
    const request = { query: { ...query }, range: { ...range }, maxBuckets }
    const key = requestKey
    const load = source.loadTimeline
    if (!load || !timeline.series.length) return
    let cancelled = false
    detailError = null
    async function refresh() {
      try {
        const data = await load!(request)
        if (!cancelled) loaded = { key, data }
      } catch {
        if (!cancelled) detailError = `Couldn't update the timeline. Try moving the selection again.`
      }
    }
    const timer = setTimeout(() => void refresh(), 120)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  })
  const tabs = [{ id: `playerActions`, label: `Player actions`, icon: `fa-bolt`, tooltip: `See the work that keeps the game fair.` }, { id: `protectedServers`, label: `Most protected server`, icon: `fa-shield-halved`, tooltip: `See which servers have their crew showing up.` }, { id: `topAdmins`, label: `Top admins`, icon: `fa-user-shield`, tooltip: `Who's putting in the work?` }, { id: `topTeams`, label: `Top teams`, icon: `fa-people-group`, tooltip: `A little friendly rivalry. Who's pulling ahead?` }]
  let previousChart: ReturnType<typeof createDashboardChartData> | undefined
  const chart = $derived.by(() => {
    previousChart = createDashboardChartData(view === `playerActions` ? visible : plotted, previousChart)
    return previousChart
  })
  const unavailable = $derived(!timeline.series.length || timeline.series.every(series => series.values.every(value => value === null)))
  const bucketFormatter = $derived(new Intl.DateTimeFormat(undefined, range.end - range.start <= 2 * 86400000 ? { hour: `2-digit`, minute: `2-digit`, timeZone: $timezone } : { month: `short`, day: `numeric`, timeZone: $timezone }))
  const formatBucket = (value: unknown) => bucketFormatter.format(new Date(String(value)))
  const formatTooltip = (value: unknown) => formatDateStamp(String(value), `dateTime`, $timezone)
  const axisLabel = { fill: `var(--color-light-tertiary)`, fontSize: 10 }
</script>

<TabbedListCard title="Timeline" caption="" {tabs} selected={view} onSelect={value => onSelect(value as DashboardTimelineView)}>
  {#if unavailable}<EmptyState title="Nothing here yet" message="Try another time range to see more of the story." />{:else}
    <div class="chart" bind:clientWidth={chartWidth}>
      {#if view === `playerActions`}
        <EvilBarChart data={chart.rows} config={chart.config} xDataKey="bucket" stackType="stacked" animationType="none" accessibility={{ label: `Player actions timeline`, description: `${caption}. Times in ${$timezone}. Use the legend to select a series and the brush to explore history.` }}>
          <EvilBarChart.Grid stroke="var(--color-dark-secondary)" strokeDasharray="0" />
          <EvilBarChart.XAxis dataKey="bucket" tickFormatter={formatBucket} tickLabelProps={axisLabel} />
          <EvilBarChart.YAxis tickLabelProps={axisLabel} />
          <EvilBarChart.Legend isClickable preserveOrder hiddenKeys={hiddenSeries} onToggle={toggleSeries} />
          <EvilBarChart.Tooltip labelFormatter={formatTooltip} />
          {#snippet canvasChildren()}<DashboardCanvasBars hiddenKeys={hiddenSeries} />{/snippet}
        </EvilBarChart>
      {:else}
        <EvilLineChart data={chart.rows} config={chart.config} xDataKey="bucket" animationType="none" accessibility={{ label: `${tabs.find(tab => tab.id === view)?.label} timeline`, description: `${caption}. Times in ${$timezone}. Follow the community's progress over time.` }}>
          <EvilLineChart.Grid stroke="var(--color-dark-secondary)" strokeDasharray="0" />
          <EvilLineChart.XAxis dataKey="bucket" tickFormatter={formatBucket} tickLabelProps={axisLabel} />
          <EvilLineChart.YAxis tickLabelProps={axisLabel} />
          <EvilLineChart.Legend isClickable />
          <EvilLineChart.Tooltip labelFormatter={formatTooltip} />
          {#snippet canvasChildren()}<DashboardCanvasLines />{/snippet}
        </EvilLineChart>
      {/if}
    </div>
    <DashboardTimelineNavigator timeline={overview} {range} onChange={value => selectedRange = value} />
    {#if detailError}<small role="status">{detailError}</small>{/if}
  {/if}
</TabbedListCard>

<style lang="scss">
  .chart { width: 100%; height: 245px; min-width: 0; }
  small { display: block; margin-top: 10px; font-size: 10px; color: var(--color-light-tertiary); }
  :global(.dashboard .tabbed-list-card) { padding: 16px 18px; }
  :global(.dashboard .tabbed-list-card__tabs button) { min-height: 28px; padding: 0 12px; font-size: var(--font-size-caption); }
</style>
