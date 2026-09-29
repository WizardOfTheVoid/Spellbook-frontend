<script lang="ts">
  import { Spline } from 'layerchart/canvas'
  import { useLineChart } from '$lib/components/evilcharts/charts/layerchart-line-chart/line-chart-context.svelte.js'
  import { dashboardAverageId } from './dashboardTimelineData'

  const chart = useLineChart()
  const keys = $derived(Object.keys(chart.config))
  $effect.pre(() => {
    const registrations = keys.map(key => ({ key, token: Symbol(key) }))
    for (const { key, token } of registrations) chart.registerSeries(token, key, true, true)
    return () => {
      for (const { key, token } of registrations) chart.registerSeries(token, key, true, false)
    }
  })
</script>

{#each keys as key (key)}
  <Spline seriesKey={key} fill="none" stroke={chart.config[key].colors?.dark?.[0] ?? chart.config[key].colors?.light?.[0]} strokeWidth={3} style={key === dashboardAverageId ? `stroke-dasharray: 7 5` : undefined} strokeOpacity={key === dashboardAverageId || chart.selectedDataKey === null || chart.selectedDataKey === key ? 1 : .15} defined={row => typeof row[key] === `number`} onclick={() => chart.selectDataKey(chart.selectedDataKey === key ? null : key)} />
{/each}
