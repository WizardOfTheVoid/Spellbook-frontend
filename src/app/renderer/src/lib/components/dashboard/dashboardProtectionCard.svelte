<script lang="ts">
  import DashboardSparkline from './dashboardSparkline.svelte'
  import Button from '$lib/components/ui/Button.svelte'
  import { tooltip } from '$lib/utils/tooltip'
  import AnimatedNumber from '$lib/components/ui/animatedNumber.svelte'
  import { dataChange } from '$lib/utils/dataChange'
  import type { DashboardEntity, DashboardViewModel } from './dashboardViewModel'
  let { protection, onOpen }: { protection: DashboardViewModel[`scoreboards`][`protection`], onOpen: (entity: DashboardEntity) => void } = $props()
</script>

<article class="protection">
  <h2>Most protected server</h2>
  {#if protection}
    <div class="identity"><i class="fa-solid fa-shield-halved" use:dataChange={[protection.members, protection.actions]} aria-hidden="true"></i><div><Button label={protection.server.name} size="sm" onClick={() => onOpen(protection.server)} /><small>Protection score</small><strong use:tooltip={`This crew is putting in the work. Give them some love!`}><AnimatedNumber value={protection.members + protection.actions} /></strong><small><AnimatedNumber value={protection.members} /> admins · <AnimatedNumber value={protection.actions} /> actions</small></div></div>
    <footer>{#if protection.team}<span>Guarded by</span><span class="owner-team"><i class="fa-solid fa-people-group" aria-hidden="true"></i>{protection.team.name}</span>{:else}<span>Community effort</span>{/if}</footer>
    <div class="activity"><DashboardSparkline values={protection.activity} label="The crew's progress" /></div>
  {:else}<p>No frontrunner yet. The crown's up for grabs.</p>{/if}
</article>

<style lang="scss">
  .protection { position: relative; min-width: 0; overflow: hidden; padding: 17px; border: 1px solid var(--color-dark-secondary); border-radius: var(--radius); background: rgbaa(var(--color-dark-primary), .34); }
  h2 { font-size: var(--font-size-label); font-weight: var(--font-weight-bold); margin: 0 0 18px; }
  .identity { display: flex; align-items: center; gap: 22px; }
  .identity > i { color: var(--color-accent-primary); font-size: 48px; }
  .identity > div { display: grid; gap: 3px; min-width: 0; }
  .protection :global(.ui-button) { justify-content: flex-start; min-height: 24px; padding: 0; border: 0; background: transparent; }
  .identity :global(.ui-button) { font-size: var(--font-size-label); }
  .identity :global(.ui-button span) { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  small, footer, p { font-size: var(--font-size-caption); color: var(--color-light-tertiary); }
  strong { font-size: 27px; line-height: 1; font-variant-numeric: tabular-nums; }
  footer { position: relative; z-index: 1; display: flex; gap: 12px; align-items: center; margin-top: 20px; padding-top: 10px; border-top: 1px solid var(--color-dark-secondary); }
  .owner-team { display: flex; gap: var(--gutter-sm); align-items: center; color: var(--color-light-secondary); }
  .activity { position: absolute; width: 47%; bottom: 0; right: 0; opacity: .85; pointer-events: none; }
  p { min-height: 145px; display: grid; align-items: center; }
</style>
