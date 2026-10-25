<script lang="ts">
  import { timezone } from '$lib/settings/timezone'
  import type { DashboardTimelineData } from './dashboardViewModel'
  let { timeline }: { timeline: DashboardTimelineData } = $props()
  let expanded = $state(false)
  const date = $derived(new Intl.DateTimeFormat(undefined, { timeZone: $timezone, year: `numeric`, month: `short`, day: `numeric`, hour: `2-digit`, minute: `2-digit` }))
  const number = new Intl.NumberFormat(`en-US`)
</script>

<details bind:open={expanded}>
  <summary>View values</summary>
  {#if expanded}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (The labelled scroll region accepts keyboard scrolling.) -->
  <div class="values" tabindex="0" role="region" aria-label="Timeline values">
    <table>
      <caption>Recorded actions in {$timezone}. Unavailable values appear as a dash.</caption>
      <thead><tr><th scope="col">{$timezone}</th>{#each timeline.series as series (series.id)}<th scope="col">{series.label}</th>{/each}</tr></thead>
      <tbody>{#each timeline.buckets as bucket, index (bucket)}<tr><th scope="row">{date.format(new Date(bucket))}</th>{#each timeline.series as series (series.id)}<td>{series.values[index] === null || series.values[index] === undefined ? `—` : number.format(series.values[index])}</td>{/each}</tr>{/each}</tbody>
    </table>
  </div>
  {/if}
</details>

<style lang="scss">
  details { margin-top: 12px; font-size: var(--font-size-caption); color: var(--color-light-tertiary); }
  summary { cursor: pointer; width: fit-content; }
  summary:focus-visible, .values:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 3px; }
  .values { max-height: 220px; overflow: auto; margin-top: 12px; }
  table { width: 100%; border-collapse: collapse; text-align: right; font-variant-numeric: tabular-nums; }
  caption { text-align: left; padding-bottom: 8px; }
  th, td { padding: 7px 10px; border-bottom: 1px solid var(--color-dark-secondary); white-space: nowrap; }
  th { font-weight: var(--font-weight-medium); }
  th:first-child { text-align: left; }
</style>
