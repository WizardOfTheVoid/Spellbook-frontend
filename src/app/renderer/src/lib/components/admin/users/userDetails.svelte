<script lang="ts">
  import type { AdminUserRecord } from '$lib/core'
  import { formatFullDateTime, formatShortRelativeDateTime } from '$lib/utils/playerUtils'
  import Icon from '../../ui/Icon.svelte'
  import PanelHeader from '../../ui/PanelHeader.svelte'
  import Tile from '../../ui/Tile.svelte'
  import TileGrid from '../../ui/TileGrid.svelte'
  export let user: AdminUserRecord
  export let now = new Date()
  export let onOpenTeam: (teamId: number) => void
</script>

<section class="user-details">
  <PanelHeader variant="section" title="Connected accounts" />
  <div class="user-details__accounts">
    <div><Icon name="fa-discord" type="brands" size="lg" /><dl><dt>Discord ID</dt><dd>{user.discordId ?? `Not linked`}</dd></dl></div>
    <div><Icon name="fa-gamepad" size="lg" /><dl><dt>PlayFab ID</dt><dd>{user.playfabId ?? `Not set`}</dd></dl></div>
  </div>
  <PanelHeader variant="section" title={`Teams (${user.teams.length})`} />
  {#if user.teams.length}<TileGrid columns={2}>
    {#each user.teams as team (team.id)}<Tile title={team.name} subtitle="View team" icon="fa-people-group" iconTone="info" onClick={() => onOpenTeam(team.id)} />{/each}
  </TileGrid>{:else}<p>This user has not joined a team.</p>{/if}
  <TileGrid columns={2}>
    <Tile title="Joined" subtitle={formatShortRelativeDateTime(user.createdAt, now)} tooltip={formatFullDateTime(user.createdAt)} icon="fa-calendar" />
    <Tile title="Updated" subtitle={formatShortRelativeDateTime(user.updatedAt, now)} tooltip={formatFullDateTime(user.updatedAt)} icon="fa-clock" />
  </TileGrid>
</section>

<style lang="scss">
  .user-details { display: grid; gap: var(--gutter-lg); }
  .user-details__accounts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gutter-md); }
  .user-details__accounts > div { display: flex; align-items: center; gap: var(--gutter-md); min-width: 0; border: 1px solid var(--color-dark-secondary); border-radius: var(--radius); padding: var(--gutter-md); }
  dl, dd, p { margin: 0; }
  dl { min-width: 0; display: grid; gap: var(--gutter-sm); }
  dt, p { color: var(--color-light-tertiary); font-size: var(--font-size-sm); }
  dd { overflow-wrap: anywhere; font-size: var(--font-size-sm); user-select: text; }
  @media (max-width: 520px) { .user-details__accounts { grid-template-columns: 1fr; } }
</style>
