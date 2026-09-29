<script lang="ts">
  import RadioGroup from '$lib/components/ui/RadioGroup.svelte'
  import type { DashboardEntity, DashboardViewQuery, DashboardEnvironment, DashboardPeriod } from './dashboardViewModel'
  let { query, teams, onChange }: { query: DashboardViewQuery, teams: readonly DashboardEntity[], onChange: (query: DashboardViewQuery) => void } = $props()
  const periods = [{ value: `allTime`, label: `All time` }, { value: `30Days`, label: `30 days` }, { value: `1Week`, label: `1 week` }, { value: `24Hours`, label: `24 hours` }, { value: `lastHour`, label: `Last hour` }]
  const environments = $derived([{ value: `global`, label: `Global` }, { value: `team`, label: `Your teams`, disabled: !teams.length }, { value: `you`, label: `You` }])
</script>

<div class="scopes">
  <RadioGroup label="Scope" value={query.environment} options={environments} variant="segmented" onChange={environment => onChange({ ...query, environment: environment as DashboardEnvironment })} />
  <RadioGroup label="Time" value={query.period} options={periods} variant="segmented" onChange={period => onChange({ ...query, period: period as DashboardPeriod })} />
  {#if !teams.length}<small>Join a team to climb together.</small>{/if}
</div>

<style lang="scss">
  .scopes { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 8px 10px; min-width: 0; }
  .scopes :global(.ui-radio-group--segmented .ui-radio) { padding: 5px 8px; transition: color var(--motion-fast) var(--easing), background-color var(--motion-fast) var(--easing), border-color var(--motion-fast) var(--easing); }
  .scopes :global(.ui-radio-group--segmented .ui-radio--selected) { color: var(--white); }
  .scopes :global(.ui-radio-group--segmented .ui-radio:not(.ui-radio--disabled):hover) { color: var(--white); background: rgbaa(var(--color-accent-primary), .18); border-color: var(--color-accent-primary); }
  .scopes :global(.ui-radio-group--segmented .ui-radio:not(.ui-radio--disabled):active) { color: var(--white); background: rgbaa(var(--color-accent-primary), .28); border-color: var(--color-accent-primary); transition-duration: 0s; }
  .scopes :global(.ui-radio-group legend) { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  small { color: var(--color-light-tertiary); font-size: var(--font-size-caption); }
</style>
