<script lang="ts">
  import type { PlayerAction } from "$lib/core"
  import {
    actionAuthor,
    actionLabel,
    formatActionDuration,
    formatActionHoursLeft,
  } from "$lib/utils/playerActions"
  import { formatFullDateTime } from "$lib/utils/playerUtils"
  import Icon from "$lib/components/ui/Icon.svelte"
  import IconBadge from "$lib/components/ui/IconBadge.svelte"

  export let action: PlayerAction
</script>

<article class="player-action-detail">
  <header>
    <IconBadge
      name={action.actionType === "ban" ? "fa-ban" : action.actionType === "unban" ? "fa-unlock" : "fa-flag"}
      tone={action.actionType === "ban" ? "danger" : "accent"}
      size="lg"
    />
    <div>
      <small>Recorded action</small>
      <h2>{actionLabel(action)}</h2>
      <p>{action.reason?.trim() || "No reason recorded."}</p>
    </div>
  </header>
  <dl>
    <div><dt><Icon name="fa-hourglass" size="sm" /> Duration</dt><dd>{formatActionDuration(action)}</dd></div>
    {#if action.actionType === "ban"}
      <div><dt><Icon name="fa-clock" size="sm" /> Hours left</dt><dd>{formatActionHoursLeft(action)}</dd></div>
    {/if}
    <div><dt><Icon name="fa-globe" size="sm" /> Scope</dt><dd>{action.scope}</dd></div>
    <div><dt><Icon name="fa-user-shield" size="sm" /> Author</dt><dd>{actionAuthor(action)}</dd></div>
    <div><dt><Icon name="fa-calendar" size="sm" /> Created</dt><dd>{formatFullDateTime(action.createdAt)}</dd></div>
  </dl>
</article>

<style lang="scss">
  .player-action-detail {
    display: grid;
    gap: var(--gutter-lg);
    border: 1px solid var(--color-dark-secondary);
    border-radius: var(--radius);
    padding: var(--gutter-md);
    background: rgba(3, 12, 18, 0.36);
  }

  header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: var(--gutter-sm);
  }

  header > div { display: grid; gap: var(--gutter-sm); }
  h2, p, dl { margin: 0; }
  header small, dt { color: var(--color-light-tertiary); font-size: var(--font-size-xs); }
  dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--gutter-md); }
  dl div { display: grid; gap: var(--gutter-sm); }
  dt { display: flex; align-items: center; gap: var(--gutter-sm); }
  dd { margin: 0; overflow-wrap: anywhere; text-transform: capitalize; }
</style>
