<script lang="ts">
  import type { AdminUserRecord } from '$lib/core'
  import { formatFullDateTime, formatShortRelativeDateTime } from '$lib/utils/playerUtils'
  import Icon from '../../ui/Icon.svelte'
  import PanelHeader from '../../ui/PanelHeader.svelte'
  import Tile from '../../ui/Tile.svelte'
  import TileGrid from '../../ui/TileGrid.svelte'
  import Input from '../../ui/Input.svelte'
  import Button from '../../ui/Button.svelte'
  export let user: AdminUserRecord
  export let now = new Date()
  export let onOpenTeam: (teamId: number) => void
  export let onSavePlayfab: (playfabId: string) => Promise<void>
  let editing = false
  let saving = false
  let playfabId = ``
  let error = ``
  let accountId: number | null = null
  $: if (accountId !== user.id) { accountId = user.id
    editing = false
    error = `` }
  async function save() {
    if (saving) return
    const userId = user.id
    saving = true
    error = ``
    try { await onSavePlayfab(playfabId)
      if (user.id === userId) editing = false }
    catch (value) { if (user.id === userId) error = value instanceof Error ? value.message : `The PlayFab ID could not be saved.` }
    finally { saving = false }
  }
</script>

<section class="user-details">
  <PanelHeader variant="section" title="Connected accounts" />
  <div class="user-details__accounts">
    <div><Icon name="fa-discord" type="brands" size="lg" /><dl><dt>Discord ID</dt><dd>{user.discordId ?? `Not linked`}</dd></dl></div>
    <div><Icon name="fa-gamepad" size="lg" /><dl><dt>PlayFab ID</dt><dd>{user.playfabId ?? `Not set`}</dd></dl></div>
    <div><Icon name="fa-computer" size="lg" /><dl><dt>Computer</dt><dd>{user.hasComputer === false ? `No computer` : user.hasComputer === true ? `Has computer` : `Not answered`}</dd></dl></div>
  </div>
  {#if editing}<form on:submit|preventDefault={save}>
    <Input label="PlayFab ID" value={playfabId} disabled={saving} onChange={value => { playfabId = value }} />
    {#if error}<p role="alert">{error}</p>{/if}
    <Button label="Save" disabled={saving || !playfabId.trim()} onClick={() => void save()} />
    <Button label="Cancel" disabled={saving} onClick={() => { editing = false }} />
  </form>{:else}<Button label="Edit PlayFab ID" onClick={() => { playfabId = user.playfabId ?? ``
    error = ``
    editing = true }} />{/if}
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
