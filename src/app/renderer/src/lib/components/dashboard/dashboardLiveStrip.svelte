<script lang="ts">
  import Avatar from '$lib/components/ui/avatar.svelte'
  import AnimatedNumber from '$lib/components/ui/animatedNumber.svelte'
  import { dataChange } from '$lib/utils/dataChange'
  import type { DashboardEntity, DashboardViewModel } from './dashboardViewModel'
  let { live, age, onOpen }: { live: DashboardViewModel[`live`], age: string, onOpen: (entity: DashboardEntity) => void } = $props()
</script>

<div class="live-strip">
  <div class="presence-row">
  <article class="presence"><div class="presence-count"><span>Admins in-game</span><strong>{live.admins}</strong></div><div class="avatars">{#each live.avatars as admin (admin.id)}<Avatar src={admin.avatar} name={admin.name} />{/each}{#if live.admins > live.avatars.length}<span class="overflow">+{live.admins - live.avatars.length}</span>{/if}</div><small>Across {live.servers} servers</small></article>
  <article class="presence"><div class="presence-count"><span>Players in your servers</span><strong><AnimatedNumber value={live.players} /></strong></div><small>Of <AnimatedNumber value={live.gamePlayers} /> players across {live.playerServers} servers</small></article>
  </div>
  <button class="latest" type="button" onclick={() => live.latest?.server && onOpen(live.latest.server)} disabled={!live.latest?.server}>
    <span class="latest-label">Latest action</span>
    {#if live.latest}<Avatar name={live.latest.actor.name} src={live.latest.actor.avatar} size="md" /><div><p><b>{live.latest.actor.name}</b> {live.latest.verb}</p><small>{live.latest.server?.name ?? `Wanted`} · {age}</small></div>{#if live.latest.server}<i class="fa-solid fa-chevron-right" use:dataChange={live.latest} aria-hidden="true"></i>{/if}{:else}<small>No recent actions</small>{/if}
  </button>
</div>

<style lang="scss">
  .live-strip { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .presence-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; min-width: 0; }
  article, button { min-width: 0; min-height: 65px; padding: 10px 14px; border: 1px solid var(--color-dark-secondary); border-radius: var(--radius); background: rgbaa(var(--color-dark-primary), .25); }
  .presence { display: flex; align-items: center; align-content: space-between; flex-wrap: wrap; gap: 14px; }
  .presence-count { display: grid; gap: 3px; flex-shrink: 0; }
  span, small { font-size: var(--font-size-caption); }
  strong { font-size: var(--font-size-3xl); line-height: 1; font-variant-numeric: tabular-nums; }
  .avatars { display: flex; align-items: center; min-width: 0; }
  .avatars :global(.avatar) { border: 1px solid var(--color-light-tertiary); margin-left: -6px; }
  .avatars :global(.avatar:first-child) { margin-left: 0; }
  .overflow { display: grid; place-items: center; width: 30px; height: 30px; border: 1px solid var(--color-dark-tertiary); border-radius: 50%; margin-left: -4px; background: var(--color-dark-primary); color: var(--color-light-tertiary); }
  small { color: var(--color-light-tertiary); }
  .presence > small { margin-left: auto; flex-basis: 100%; text-align: right; }
  .latest { display: flex; align-items: center; gap: 12px; text-align: left; cursor: pointer; }
  .latest:hover { border-color: var(--color-dark-tertiary); }
  .latest > div { min-width: 0; flex: 1; }
  .latest p { font-size: var(--font-size-xs); margin: 0 0 4px; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }
  .latest small { display: block; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }
  .latest-label { flex-shrink: 0; }
  .latest > i { color: var(--color-light-tertiary); font-size: var(--font-size-xs); }
  @container dashboard (max-width: 760px) { .live-strip { grid-template-columns: 1fr; } }
  @container dashboard (max-width: 480px) { .presence-row { grid-template-columns: 1fr; } }
</style>
