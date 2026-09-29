<script lang="ts">
  import StatChip from '$lib/components/ui/StatChip.svelte'
  import AnimatedNumber from '$lib/components/ui/animatedNumber.svelte'
  import { dashboardSeriesColor } from './dashboardTimelineData'
  import { profileCommandAppearance } from '$lib/utils/profileActions'
  import type { DashboardActionTotals } from './dashboardViewModel'
  let { totals, count }: { totals: DashboardActionTotals, count: (value: number | null) => string } = $props()
  const groups = [[{ key: `bans`, kind: `ban`, label: `Bans`, icon: profileCommandAppearance.ban.icon }, { key: `kicks`, kind: `kick`, label: `Kicks`, icon: profileCommandAppearance.kick.icon }], [{ key: `serversay`, kind: `serversay`, label: `Serversay`, icon: profileCommandAppearance.server_message.icon }, { key: `adminsay`, kind: `adminsay`, label: `Adminsay`, icon: profileCommandAppearance.admin_message.icon }]] as const
</script>

<article class="breakdown" aria-label="Actions by type">
  {#each groups as group}<div class="pair">{#each group as item}<StatChip label={item.label} icon={item.icon} iconSize="lg" iconColor={dashboardSeriesColor(item.kind)} value={count(totals[item.key])}><svelte:fragment slot="value"><AnimatedNumber value={totals[item.key]} formatValue={count} /></svelte:fragment></StatChip>{/each}</div>{/each}
  <small><AnimatedNumber value={totals.warnings} formatValue={count} /> warnings · <AnimatedNumber value={totals.unbans} formatValue={count} /> unbans</small>
</article>

<style lang="scss">
  .breakdown { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gutter-md) 20px; padding: calc(var(--gutter-md) + var(--gutter-sm)) 18px; border: 1px solid var(--color-dark-secondary); border-radius: var(--radius); background: rgbaa(var(--color-dark-primary), .2); }
  .breakdown :global(.stat-chip) { flex: 1; }
  .pair { display: flex; align-items: center; gap: var(--gutter-lg); flex: 1 1 0; min-width: min-content; }
  .breakdown :global(.stat-chip__value) { font-size: 15px; font-variant-numeric: tabular-nums; }
  small { font-size: var(--font-size-caption); color: var(--color-light-tertiary); margin-left: auto; }
</style>
