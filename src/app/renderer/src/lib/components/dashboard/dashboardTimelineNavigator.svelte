<script lang="ts">
  import { Chart, Canvas, Html, BrushContext } from 'layerchart'
  import { Area, Spline } from 'layerchart/canvas'
  import { scaleTime } from 'd3-scale'
  import { timezone } from '$lib/settings/timezone'
  import { formatDateStamp } from '@spellbook/shared/dateFormatting'
  import { dashboardTimelineBounds } from './dashboardTimelineRange'
  import { dashboardBrushRange, dashboardBrushKeyRange } from './dashboardTimelineBrush'
  import type { DashboardTimeRange, DashboardTimelineData } from './dashboardViewModel'
  let { timeline, range, onChange }: { timeline: DashboardTimelineData, range: DashboardTimeRange, onChange: (range: DashboardTimeRange) => void } = $props()
  const bounds = $derived(dashboardTimelineBounds(timeline))
  const data = $derived(timeline.buckets.map((bucket, index) => ({ bucket: new Date(bucket), value: timeline.series.some(series => series.values[index] === null) ? null : timeline.series.reduce((total, series) => total + (series.values[index] ?? 0), 0) })))
  const domain = $derived([new Date(bounds.start), new Date(bounds.end)])
  const selection = $derived([new Date(range.start), new Date(range.end)])
  const format = (value: number) => formatDateStamp(new Date(value).toISOString(), `dateTime`, $timezone)
  function select(values: readonly (number | Date | string | null)[]) {
    const next = dashboardBrushRange(values, bounds)
    if (next.start !== range.start || next.end !== range.end) onChange(next)
  }
  function handleKey(event: KeyboardEvent) {
    const position = (event.currentTarget as HTMLElement).dataset.position
    const next = dashboardBrushKeyRange(range, bounds, event.key, position === `left` || position === `right` ? position : `move`)
    if (!next) return
    event.preventDefault()
    onChange(next)
  }
</script>

<div class="navigator" role="group" aria-label="Timeline zoom and pan">
  <div class="overview">
    <Chart {data} x="bucket" y="value" xScale={scaleTime()} xDomain={domain} yBaseline={0} padding={{ top: 0, bottom: 0, left: 0, right: 0 }}>
      <Canvas pointerEvents={false}>
        <Area fill="var(--color-chart-1)" fillOpacity={.1} defined={row => typeof row.value === `number`} />
        <Spline fill="none" stroke="var(--color-chart-1)" strokeWidth={1.7} defined={row => typeof row.value === `number`} />
      </Canvas>
      <Html>
        <BrushContext x={selection} minExtent={{ x: Math.min(60000, bounds.end - bounds.start) }} handleSize={10}
          range={{ role: `button`, tabindex: 0, 'aria-label': `Move timeline window`, onkeydown: handleKey }}
          handle={{ role: `button`, tabindex: 0, 'aria-label': `Resize timeline window`, onkeydown: handleKey }}
          onChange={({ brush }) => select(brush.x)} />
      </Html>
    </Chart>
  </div>
  <div class="dates"><small>{format(range.start)}</small><small>{format(range.end)}</small></div>
</div>

<style lang="scss">
  .navigator { margin-top: var(--gutter-md); }
  .overview { height: 40px; position: relative; background: rgbaa(var(--color-dark-secondary), .4); border-radius: 5px; overflow: hidden; }
  .navigator :global(.lc-brush-range) { border: 1px solid var(--color-accent-primary); background: rgbaa(var(--color-accent-primary), .15); }
  .navigator :global(.lc-brush-handle) { background: var(--color-accent-primary); }
  .navigator :global([role="button"]:focus-visible) { outline: 2px solid var(--white); outline-offset: -2px; }
  .dates { display: flex; justify-content: space-between; gap: var(--gutter-sm); margin-top: var(--gutter-sm); }
  small { color: var(--color-light-tertiary); font-size: var(--font-size-caption); }
</style>
