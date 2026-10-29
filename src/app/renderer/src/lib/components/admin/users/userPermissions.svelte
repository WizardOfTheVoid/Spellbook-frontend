<script lang="ts">
  import type { AdminUserRecord } from '$lib/core'
  import Toggle from '../../ui/Toggle.svelte'
  import Tag from '../../ui/Tag.svelte'
  export let user: AdminUserRecord
  export let saving = false
  export let onWantedPermission: (enabled: boolean) => void
  export let onReleasePermission: (enabled: boolean) => void
</script>

<section class="user-permissions">
  <div class="user-permissions__row"><div><h3>Wanted creation</h3><p>Allow this user to add players to the Wanted list.</p></div>
    <Toggle label="Wanted creation" showLabel={false} checked={user.wantedCreationEnabled} disabled={saving} onChange={onWantedPermission} /></div>
  <div class="user-permissions__row"><div><h3>Release creation</h3><p>{user.isSuperadmin ? `Included with Superadmin access.` : `Allow this user to manage releases, news, and the roadmap.`}</p></div>
    <Toggle label="Release creation" showLabel={false} checked={user.isSuperadmin || user.releaseCreationEnabled} disabled={saving || user.isSuperadmin} onChange={onReleasePermission} /></div>
  <div class="user-permissions__tags">{#each user.permissions as permission}<Tag label={permission} icon="fa-key" />{:else}<p>No additional system permissions.</p>{/each}</div>
</section>

<style lang="scss">
  .user-permissions { display: grid; gap: var(--gutter-lg); }
  .user-permissions__row { display: flex; align-items: center; justify-content: space-between; gap: var(--gutter-lg); padding: var(--gutter-md); border: 1px solid var(--color-dark-secondary); border-radius: var(--radius); }
  h3, p { margin: 0; }
  h3 { font-size: var(--font-size-md); }
  p { color: var(--color-light-tertiary); font-size: var(--font-size-sm); line-height: 1.5; }
  .user-permissions__row p { margin-top: 5px; }
  .user-permissions__tags { display: flex; flex-wrap: wrap; gap: var(--gutter-sm); }
</style>
