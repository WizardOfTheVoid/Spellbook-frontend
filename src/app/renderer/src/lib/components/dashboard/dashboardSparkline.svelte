<script lang="ts">
  import { Chart, Canvas } from 'layerchart'
  import { Area, Spline } from 'layerchart/canvas'
  let { values, label }: { values: readonly (number | null)[], label: string } = $props()
  const data = $derived(values.map((value, index) => ({ bucket: index, value })))
</script>

<div class="sparkline" role="img" aria-label={label}>
  <Chart {data} x="bucket" y="value" yBaseline={0} padding={{ top: 5, bottom: 0, left: 0, right: 0 }}>
    <Canvas pointerEvents={false}>
      <Area fill="var(--color-chart-1)" fillOpacity={.1} defined={row => typeof row.value === `number`} />
      <Spline fill="none" stroke="var(--color-chart-1)" strokeWidth={1.7} defined={row => typeof row.value === `number`} />
    </Canvas>
  </Chart>
</div>

<style>
  .sparkline { width: 100%; height: 65px; min-width: 0; pointer-events: none; }
</style>
