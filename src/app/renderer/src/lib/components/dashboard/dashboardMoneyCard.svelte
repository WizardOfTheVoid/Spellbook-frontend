<script lang="ts">
  import DashboardSparkline from './dashboardSparkline.svelte'
  import { dataChange } from '$lib/utils/dataChange'
  import AnimatedNumber from '$lib/components/ui/animatedNumber.svelte'
  import type { DashboardViewModel } from './dashboardViewModel'
  let { metrics, currency, count }: { metrics: DashboardViewModel[`metrics`], currency: (value: number | null) => string, count: (value: number | null) => string } = $props()
</script>

<article class="money">
  <div class="copy"><h2>Cheater money wasted</h2><div class="amount"><i class="fa-solid fa-dollar-sign" use:dataChange={metrics.money} aria-hidden="true"></i><div><strong><AnimatedNumber value={metrics.money} formatValue={currency} /></strong><small>{#if metrics.accounts === null}Not enough history yet{:else}<AnimatedNumber value={metrics.accounts} formatValue={count} /> cheater accounts · estimated losses{/if}</small></div></div></div>
  {#if metrics.money !== null}<div class="chart"><DashboardSparkline values={metrics.moneySeries} label="Cheater money wasted over time" /></div>{/if}
</article>

<style lang="scss">
  .money { display: flex; align-items: center; gap: 20px; overflow: hidden; border: 1px solid rgbaa(var(--color-accent-primary), .23); border-radius: var(--radius); padding: 14px 18px; background: linear-gradient(100deg, #{rgbaa(var(--color-accent-primary), .045)}, transparent); }
  .copy { min-width: 0; flex-shrink: 0; }
  h2 { font-size: var(--font-size-label); margin: 0 0 8px; }
  .amount { display: flex; gap: 18px; align-items: center; }
  .amount > i { display: grid; place-items: center; width: 45px; height: 45px; border-radius: 50%; border: 1px solid var(--color-accent-primary); color: var(--color-accent-primary); font-size: 27px; box-shadow: 0 0 20px rgbaa(var(--color-accent-primary), .08); }
  .amount > div { display: grid; gap: 4px; }
  strong { font-size: 31px; font-weight: var(--font-weight-bold); line-height: 1; font-variant-numeric: tabular-nums; }
  small { color: var(--color-light-tertiary); font-size: var(--font-size-caption); }
  .chart { margin-left: auto; width: 54%; min-width: 0; }
  @container dashboard (max-width: 480px) { .money { align-items: flex-start; flex-direction: column; } .copy { flex-shrink: 1; } .chart { width: 100%; } }
</style>
