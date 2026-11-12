<script lang="ts">
  import StatChip from '$lib/components/ui/StatChip.svelte'
  import AnimatedNumber from '$lib/components/ui/animatedNumber.svelte'
  import { dashboardSeriesColor } from './dashboardTimelineData'
  import { profileCommandAppearance } from '$lib/utils/profileActions'
  import type { DashboardActionTotals } from './dashboardViewModel'
  let { totals, count, actions }: { totals: Partial<DashboardActionTotals>, count: (value: number | null) => string, actions?: readonly (keyof DashboardActionTotals)[] } = $props()
  const items = {
    bans: { kind: `ban`, label: `Bans`, icon: profileCommandAppearance.ban.icon },
    kicks: { kind: `kick`, label: `Kicks`, icon: profileCommandAppearance.kick.icon },
    warnings: { kind: `warn`, label: `Warnings`, icon: profileCommandAppearance.warn.icon },
    unbans: { kind: `unban`, label: `Unbans`, icon: profileCommandAppearance.unban.icon },
    serversay: { kind: `serversay`, label: `Serversay`, icon: profileCommandAppearance.server_message.icon },
    adminsay: { kind: `adminsay`, label: `Adminsay`, icon: profileCommandAppearance.admin_message.icon }
  }
  const groups = $derived.by(() => {
    const keys = actions ?? [`bans`, `kicks`, `serversay`, `adminsay`] as const
    return Array.from({ length: Math.ceil(keys.length / 2) }, (_, index) => keys.slice(index * 2, index * 2 + 2))
  })
</script>

<article class="breakdown" aria-label="Actions by type">
  {#each groups as group}<div class="pair">{#each group as key}<StatChip label={items[key].label} icon={items[key].icon} iconSize="lg" iconColor={dashboardSeriesColor(items[key].kind)} value={count(totals[key] ?? null)}><svelte:fragment slot="value"><AnimatedNumber value={totals[key] ?? null} formatValue={count} /></svelte:fragment></StatChip>{/each}</div>{/each}
  {#if !actions}<small><AnimatedNumber value={totals.warnings ?? null} formatValue={count} /> warnings · <AnimatedNumber value={totals.unbans ?? null} formatValue={count} /> unbans</small>{/if}
</article>

<style lang="scss">
  .breakdown { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gutter-md) 20px; padding: calc(var(--gutter-md) + var(--gutter-sm)) 18px; border: 1px solid var(--color-dark-secondary); border-radius: var(--radius); background: rgbaa(var(--color-dark-primary), .2); }
  .breakdown :global(.stat-chip) { flex: 1; }
  .pair { display: flex; align-items: center; gap: var(--gutter-lg); flex: 1 1 0; min-width: min-content; }
  .breakdown :global(.stat-chip__value) { font-size: 15px; font-variant-numeric: tabular-nums; }
  small { font-size: var(--font-size-caption); color: var(--color-light-tertiary); margin-left: auto; }
</style>
