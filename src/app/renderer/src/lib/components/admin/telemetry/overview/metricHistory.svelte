<script lang="ts">
  import { scaleLinear } from 'd3-scale'
  import { EvilLineChart, type ChartConfig } from '$lib/components/evilcharts/charts/layerchart-line-chart'
  import type { MetricSample } from '../session/telemetryModels'
  import { formatRecordTime } from '../timeline/timelineController'
  import { metricHistoryRows } from './metricHistory'

  let { label, samples, timeMs, color, maximum = 100 }: {
    label: string, samples: MetricSample[], timeMs: number, color: string, maximum?: number
  } = $props()
  const rows = $derived(metricHistoryRows(samples, timeMs))
  const observed = $derived(rows.some(row => row.value !== null))
  const config = $derived<ChartConfig>({ value: { label, colors: { light: [color], dark: [color] } } })
  const chartProps = $derived({
    xScale: scaleLinear(),
    xDomain: [rows[0]?.timeMs ?? 0, Math.max(timeMs, (rows[0]?.timeMs ?? 0) + 1)],
    yDomain: [0, Math.max(maximum, ...rows.map(row => row.value ?? 0))],
  })
  const axisLabel = { fill: `var(--color-light-tertiary)`, fontSize: 10 }
  const formatTime = (value: unknown) => formatRecordTime(Number(value) * 1000).split(`.`)[0]
</script>

<div class="history">
  <div class="history-label"><span style:background={color}></span><strong>{label}</strong></div>
  {#if observed}
    <div class="chart">
      <EvilLineChart data={rows} {config} {chartProps} xDataKey="timeMs" animationType="none" curveType="linear"
        accessibility={{ label: `${label} observations`, description: `Recorded values over elapsed session time. Gaps indicate missing values or a new lifetime.` }}>
        <EvilLineChart.Grid stroke="var(--color-dark-secondary)" strokeDasharray="0" />
        <EvilLineChart.XAxis dataKey="timeMs" ticks={4} tickFormatter={formatTime} tickLabelProps={axisLabel} />
        <EvilLineChart.YAxis ticks={3} tickLabelProps={axisLabel} />
        <EvilLineChart.Line dataKey="value" connectNulls={false} strokeWidth={1.8}>
          <EvilLineChart.Dot />
        </EvilLineChart.Line>
      </EvilLineChart>
    </div>
  {:else}<p>No {label.toLowerCase()} observations at this time.</p>{/if}
</div>

<style lang="scss">
  .history { min-width: 0; }
  .history-label { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; font-size: var(--font-size-caption); color: var(--color-light-secondary); }
  .history-label span { width: 7px; height: 7px; border-radius: 50%; }
  .history-label strong { font-weight: var(--font-weight-medium); }
  .chart { width: 100%; height: 120px; min-width: 0; }
  p { min-height: 120px; display: grid; place-items: center; margin: 0; color: var(--color-light-tertiary); font-size: var(--font-size-xs); }
</style>
