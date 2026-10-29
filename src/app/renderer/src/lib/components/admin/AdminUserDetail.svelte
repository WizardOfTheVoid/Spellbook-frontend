<script lang="ts">
  import { getAdminName } from '@spellbook/shared/adminName.js'
  import { onMount } from 'svelte'
  import type { AdminUserRecord } from '$lib/core'
  import type { AdminUserTab } from './adminNavigation'
  import AvatarUser from '../ui/avatars/avatarUser.svelte'
  import Icon from '../ui/Icon.svelte'
  import Tabs from '../ui/tabs.svelte'
  import AdminUserAccess from './AdminUserAccess.svelte'
  import UserDetails from './users/userDetails.svelte'
  import UserActivity from './users/userActivity.svelte'
  import UserPermissions from './users/userPermissions.svelte'
  import { accountStatus, accountStatusLabel } from './accountStatus'
  export let user: AdminUserRecord
  export let tab: AdminUserTab = `details`
  export let active = true
  export let saving = false
  export let accountControlDisabled = false
  export let onTab: (tab: AdminUserTab) => void = value => { tab = value }
  export let onWantedPermission: (enabled: boolean) => void
  export let onReleasePermission: (enabled: boolean) => void
  export let onAccountEnabled: (enabled: boolean) => void
  export let onBanUser: () => void
  export let onOpenTeam: (teamId: number) => void
  const tabs = [{ value: `details`, label: `Details` }, { value: `activity`, label: `Activity` }, { value: `permissions`, label: `Permissions` }, { value: `actions`, label: `Actions` }]
  $: status = accountStatus(user)
  let now = new Date()
  onMount(() => {
    const timer = window.setInterval(() => { now = new Date() }, 60_000)
    return () => window.clearInterval(timer)
  })
</script>

<div class="admin-user-profile">
	<header class="user-identity">
		<AvatarUser src={user.avatarUrl} size={76} class="user-identity__avatar" fallbackTone="muted" />
		<div class="user-identity__copy">
			<div class="user-identity__labels">
				<span class="user-status" class:user-status--banned={status === "suspended"} class:user-status--pending={status === "awaitingApproval"}>
					<Icon name={status === "suspended" ? "fa-ban" : status === "enabled" ? "fa-circle-check" : "fa-hourglass-half"} size="sm" />
					{accountStatusLabel(status)}
				</span>
				{#if user.isSuperadmin}<span class="user-role"><Icon name="fa-shield-halved" size="sm" />Superadmin</span>{/if}
			</div>
			<h2>{getAdminName(user)}</h2>
			<p>@{user.username}<span>User #{user.id}</span></p>
		</div>
	</header>

  <Tabs items={tabs} value={tab} label="User" onChange={value => onTab(value as AdminUserTab)}>
    {#if tab === `details`}<UserDetails {user} {now} {onOpenTeam} />
    {:else if tab === `activity`}<UserActivity {user} {now} {active} />
    {:else if tab === `permissions`}<UserPermissions {user} {saving} {onWantedPermission} {onReleasePermission} />
    {:else}<AdminUserAccess {user} {saving} disabled={accountControlDisabled} onBan={onBanUser} onEnable={() => onAccountEnabled(true)} />{/if}
  </Tabs>
</div>

<style lang="scss">
	.admin-user-profile { display: grid; align-content: start; gap: var(--gutter-lg); }
	.user-identity { display: flex; align-items: center; gap: var(--gutter-lg); padding: var(--gutter-sm) 0; }
	.user-identity :global(.user-identity__avatar) { border: 1px solid var(--color-dark-tertiary); background: rgbaa(var(--color-light-primary), 0.025); }
	.user-identity__copy { min-width: 0; display: grid; gap: var(--gutter-sm); }
	h2, p { margin: 0; }
	h2 { font-size: var(--font-size-2xl); line-height: 1.2; overflow-wrap: anywhere; }
	.user-identity__copy p { display: flex; flex-wrap: wrap; gap: var(--gutter-md); color: var(--color-light-secondary); font-size: var(--font-size-sm); }
	.user-identity__copy p span { color: var(--color-light-tertiary); }
	.user-identity__labels { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gutter-md); }
	.user-status, .user-role { display: inline-flex; align-items: center; gap: 6px; font-size: var(--font-size-xs); font-weight: var(--font-weight-medium); }
	.user-status { color: var(--color-accent-secondary); }
	.user-status--banned { color: var(--color-accent-quaternary); }
	.user-status--pending { color: var(--color-accent-primary); }
	.user-role { color: var(--color-light-secondary); }
</style>
