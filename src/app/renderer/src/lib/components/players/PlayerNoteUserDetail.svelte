<script lang="ts">
  import type { PlayerNoteUserReference } from "$lib/core"
  import IconBadge from "$lib/components/ui/IconBadge.svelte"

  export let user: PlayerNoteUserReference
</script>

<article class="player-note-user-detail">
  <header>
    <IconBadge name="fa-user-shield" tone="accent" size="lg" />
    <div>
      <small>Referenced admin</small>
      <h2>{user.displayName}</h2>
      <p>@{user.username}</p>
    </div>
  </header>
  <dl>
    <div><dt>Application user</dt><dd>#{user.id}</dd></div>
    <div><dt>Status</dt><dd>{user.isActive && !user.bannedAt ? "Active" : "Inactive"}</dd></div>
  </dl>
</article>

<style lang="scss">
  .player-note-user-detail {
    display: grid;
    gap: var(--gutter-lg);
    border: 1px solid var(--color-dark-secondary);
    border-radius: var(--radius);
    padding: var(--gutter-md);
    background: rgba(3, 12, 18, 0.52);
  }
  header { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: var(--gutter-sm); }
  header > div { display: grid; gap: var(--gutter-sm); }
  small, dt { color: var(--color-light-tertiary); font-size: var(--font-size-xs); }
  h2, p, dl { margin: 0; }
  dl { display: flex; flex-wrap: wrap; gap: var(--gutter-lg); }
  dl div { display: grid; gap: var(--gutter-sm); }
  dd { margin: 0; }
</style>
