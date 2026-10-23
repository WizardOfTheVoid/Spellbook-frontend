<script lang="ts">
  import { getChartContext } from 'layerchart'
  import { Rect } from 'layerchart/canvas'
  import { useBarChart } from '$lib/components/evilcharts/charts/layerchart-bar-chart/bar-chart-context.svelte.js'
  import { getBarPositions } from '$lib/components/evilcharts/ui/layerchart-chart/bar-geometry'
  let { hiddenKeys = [] }: { hiddenKeys?: readonly string[] } = $props()

  const chart = useBarChart()
  const layer = getChartContext<Record<string, unknown>>()
  const token = $props.id()
  const keys = $derived(Object.keys(chart.config).filter(key => !hiddenKeys.includes(key)))
  layer.registerComponent({ name: `DashboardCanvasBars`, kind: `composite-mark`, markInfo: () => ({ seriesKey: keys[0], stacks: true }) })
  $effect.pre(() => {
    const registered = keys
    for (const key of registered) chart.registerBar(`${token}:${key}`, key, true)
    return () => {
      for (const key of registered) chart.registerBar(`${token}:${key}`, undefined, false)
    }
  })
  const bandSize = $derived(layer.xScale.bandwidth?.() ?? 0)
  const slot = $derived(getBarPositions({ bandSize, count: 1, barGap: chart.barGap, barCategoryGap: chart.barCategoryGap })[0])
  const insets = $derived({ left: slot?.offset ?? 0, right: Math.max(0, bandSize - (slot?.offset ?? 0) - (slot?.size ?? 0)), bottom: 3 })
  const marks = $derived(keys.map(key => ({ key, stack: layer.stackAccessorsFor({ seriesKey: key, stacksImplicitly: true }), color: chart.config[key].colors?.dark?.[0] ?? chart.config[key].colors?.light?.[0] })))
  function select(key: string) {
    chart.selectDataKey(chart.selectedDataKey === key ? null : key)
  }
</script>

{#each marks as mark (mark.key)}
  <Rect
    data={chart.data.filter(row => typeof row[mark.key] === `number`)}
    x={chart.xKey}
    y={row => mark.stack?.y1(row) ?? Number(row[mark.key])}
    width={bandSize}
    height={row => Math.abs(Number(layer.yScale(mark.stack?.y0(row) ?? 0)) - Number(layer.yScale(mark.stack?.y1(row) ?? Number(row[mark.key]))))}
    {insets}
    rx={chart.barRadius}
    fill={mark.color}
    fillOpacity={chart.selectedDataKey === null || chart.selectedDataKey === mark.key ? 1 : .15}
    onclick={() => select(mark.key)}
  />
{/each}
