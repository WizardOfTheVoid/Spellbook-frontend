<script lang="ts">
  import { onDestroy } from 'svelte'
  import { getServerApi, type AdminUserRecord, type AuditLogRecord } from '$lib/core'
  import { authState } from '$lib/auth/user'
  import { unwrap } from '$lib/utils/apiResult'
  import { formatFullDateTime, formatShortRelativeDateTime } from '$lib/utils/playerUtils'
  import { tooltip } from '$lib/utils/tooltip'
  import { UserActivityController } from './userActivityController'
  import { userActivityPresentation } from './userActivityPresentation'
  import PanelHeader from '../../ui/PanelHeader.svelte'
  import IconButton from '../../ui/IconButton.svelte'
  import EmptyState from '../../ui/EmptyState.svelte'
  import Tile from '../../ui/Tile.svelte'
  import TileGrid from '../../ui/TileGrid.svelte'
  import ListRow from '../../ui/ListRow.svelte'
  export let user: AdminUserRecord
  export let now = new Date()
  export let active = true
  const controller = new UserActivityController(async id => unwrap<AuditLogRecord[]>(await getServerApi().admin.users.activity(id), `Activity could not be loaded.`), value => { state = value })
  let state = controller.state
  $: { controller.setContext($authState.user?.id ?? null, user.id, active)
    if (active) void controller.refresh() }
  $: items = state.records.map(record => ({ id: record.id, ...userActivityPresentation(record) }))
  onDestroy(() => controller.destroy())
</script>

<section class="user-activity">
  <TileGrid columns={2}>
    <Tile title="Last active" subtitle={user.lastActive ? formatShortRelativeDateTime(user.lastActive, now) : `Never`} tooltip={user.lastActive ? formatFullDateTime(user.lastActive) : null} icon="fa-clock" iconTone="info" />
    <Tile title="Last login" subtitle={user.lastLogin ? formatShortRelativeDateTime(user.lastLogin, now) : `Never`} tooltip={user.lastLogin ? formatFullDateTime(user.lastLogin) : null} icon="fa-right-to-bracket" iconTone="accent" />
    <Tile title="SpellBook version" subtitle={user.currentVersion ?? `Not reported`} icon="fa-code-branch" iconTone="info" />
  </TileGrid>
  <PanelHeader variant="section" title="Recent activity"><svelte:fragment slot="trailing"><IconButton icon="fa-rotate" ariaLabel="Refresh activity" disabled={state.loading} onClick={() => void controller.refresh()} /></svelte:fragment></PanelHeader>
  {#if state.error}<p role="alert">{state.error}</p>{/if}
  {#each items as item (item.id)}<ListRow title={item.description} subtitle={`${item.target} · ${item.outcome}`}>
    <svelte:fragment slot="trailing"><time datetime={item.createdAt} use:tooltip={formatFullDateTime(item.createdAt)}>{formatShortRelativeDateTime(item.createdAt, now)}</time></svelte:fragment>
  </ListRow>{:else}<EmptyState title={state.loading ? `Loading activity` : `No recorded activity`} message={state.loading ? `Getting recent activity.` : `Recorded actions by this user will appear here.`} />{/each}
</section>

<style lang="scss">
  .user-activity { display: grid; gap: var(--gutter-md); }
  time, p { color: var(--color-light-tertiary); font-size: var(--font-size-sm); }
</style>
