<script lang="ts">
	import type { AdminUserRecord } from "$lib/core"
	import Icon from "$lib/components/ui/Icon.svelte"
	import Tag from "$lib/components/ui/Tag.svelte"
	import Tile from "$lib/components/ui/Tile.svelte"
	import TileGrid from "$lib/components/ui/TileGrid.svelte"
	import Toggle from "$lib/components/ui/Toggle.svelte"
	import { accountStatus, accountStatusLabel } from "./accountStatus"

	export let user: AdminUserRecord
	export let saving = false
	export let accountControlDisabled = false
	export let onWantedPermission: (enabled: boolean) => void
	export let onAccountEnabled: (enabled: boolean) => void
	export let onOpenTeam: (teamId: number) => void

	$: status = accountStatus(user)

	function formatDate(value: string | null): string {
		if (!value) return "Never"
		const date = new Date(value)
		return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
	}
</script>

<div class="admin-user grid-stack gap-125">
	<section class="admin-section" aria-labelledby="admin-identity-heading">
		<h2 id="admin-identity-heading">Identity</h2>
		<div class="admin-user__identity">
			<span class="admin-user__avatar">
				{#if user.avatarUrl}<img src={user.avatarUrl} alt="" />{:else}<Icon name="fa-user" size="xlg" tone="muted" />{/if}
			</span>
			<span><strong>{user.displayName}</strong><small>@{user.username}</small></span>
		</div>
		<TileGrid columns={1}>
			<Tile title="PlayFab ID" value={user.playfabId ?? "Not set"} icon="fa-gamepad" />
			<Tile title="Discord ID" value={user.discordId ?? "Not linked"} icon="fa-at" />
			<Tile title="User ID" value={user.id.toString()} icon="fa-hashtag" />
		</TileGrid>
	</section>

	<section class="admin-section" aria-labelledby="admin-status-heading">
		<h2 id="admin-status-heading">Account status</h2>
		<TileGrid columns={1}>
			<Tile
				title="Status"
				value={accountStatusLabel(status)}
				icon="fa-circle-check"
				iconTone={status === "suspended" ? "danger" : status === "enabled" ? "success" : "default"}
			/>
			<Tile title="Last seen" value={formatDate(user.lastSeen)} icon="fa-clock" />
			{#if user.bannedAt}
				<Tile title="Banned at" value={formatDate(user.bannedAt)} icon="fa-ban" iconTone="danger" />
				<Tile title="Ban reason" value={user.banReason ?? "No reason"} icon="fa-message" iconTone="danger" />
			{/if}
		</TileGrid>
		<Toggle
			label="Account access"
			description={accountStatusLabel(status)}
			checked={user.isActive}
			disabled={saving || accountControlDisabled}
			onChange={onAccountEnabled}
		/>
	</section>

	<section class="admin-section admin-section--control" aria-labelledby="admin-wanted-heading">
		<div>
			<h2 id="admin-wanted-heading">Wanted system</h2>
			<p>Allow this user and their Admin Tool to create new Wanted players.</p>
		</div>
		<Toggle
			label="Wanted creation"
			description={user.wantedCreationEnabled ? "Enabled" : "Disabled"}
			checked={user.wantedCreationEnabled}
			disabled={saving}
			onChange={onWantedPermission}
		/>
	</section>

	<section class="admin-section" aria-labelledby="admin-teams-heading">
		<h2 id="admin-teams-heading">Teams</h2>
		<div class="admin-user__teams">
			{#each user.teams as team (team.id)}
				<Tag label={team.name} icon="fa-people-group" onClick={() => onOpenTeam(team.id)} />
			{:else}
				<p>This user is not part of a team.</p>
			{/each}
		</div>
	</section>

	<section class="admin-section" aria-labelledby="admin-permissions-heading">
		<h2 id="admin-permissions-heading">System permissions</h2>
		<TileGrid columns={1}>
			<Tile title="Superadmin" value={user.isSuperadmin ? "Yes" : "No"} icon="fa-shield-halved" />
			<Tile title="Permissions" value={user.permissions.join(", ") || "None"} icon="fa-key" />
		</TileGrid>
	</section>

	<section class="admin-section" aria-labelledby="admin-metadata-heading">
		<h2 id="admin-metadata-heading">Account metadata</h2>
		<TileGrid columns={1}>
			<Tile title="Last login" value={formatDate(user.lastLogin)} icon="fa-right-to-bracket" />
			<Tile title="Created" value={formatDate(user.createdAt)} icon="fa-calendar-plus" />
			<Tile title="Updated" value={formatDate(user.updatedAt)} icon="fa-pen" />
		</TileGrid>
	</section>
</div>

<style lang="scss">
	.admin-section { display: grid; gap: var(--gutter-md); }
	.admin-section + .admin-section { padding-top: var(--gutter-md); border-top: 1px solid var(--color-dark-secondary); }
	.admin-section h2 { margin: 0; font-size: var(--font-size-lg); font-weight: var(--font-weight-medium); }
	.admin-section p { margin: 0; color: var(--color-light-tertiary); font-size: var(--font-size-sm); }
	.admin-section--control { grid-template-columns: minmax(0, 1fr) auto; align-items: center; }
	.admin-section--control > div { display: grid; gap: var(--gutter-sm); }
	.admin-user__identity { display: flex; align-items: center; gap: var(--gutter-lg); }
	.admin-user__avatar { width: 88px; height: 88px; display: grid; place-items: center; flex: 0 0 auto; overflow: hidden; border: 1px solid var(--color-dark-tertiary); border-radius: 999px; }
	.admin-user__avatar img { width: 100%; height: 100%; object-fit: cover; }
	.admin-user__identity > span:last-child { min-width: 0; display: grid; gap: var(--gutter-sm); }
	.admin-user__identity strong { overflow: hidden; font-size: var(--font-size-2xl); text-overflow: ellipsis; white-space: nowrap; }
	.admin-user__identity small { color: var(--color-light-tertiary); }
	.admin-user__teams { display: flex; flex-wrap: wrap; gap: var(--gutter-sm); }
</style>
