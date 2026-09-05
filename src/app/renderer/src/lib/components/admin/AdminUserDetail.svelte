<script lang="ts">
	import type { AdminUserRecord } from "$lib/core"
	import Icon from "$lib/components/ui/Icon.svelte"
	import Tag from "$lib/components/ui/Tag.svelte"
	import Tile from "$lib/components/ui/Tile.svelte"
	import TileGrid from "$lib/components/ui/TileGrid.svelte"
	import Toggle from "$lib/components/ui/Toggle.svelte"
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte"
	import AdminUserAccess from "./AdminUserAccess.svelte"
	import { accountStatus, accountStatusLabel } from "./accountStatus"

	export let user: AdminUserRecord
	export let saving = false
	export let accountControlDisabled = false
	export let onWantedPermission: (enabled: boolean) => void
	export let onAccountEnabled: (enabled: boolean) => void
	export let onBanUser: () => void
	export let onOpenTeam: (teamId: number) => void

	$: status = accountStatus(user)

	function formatDate(value: string | null): string {
		if (!value) return `Never`
		const date = new Date(value)
		return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
	}
</script>

<div class="admin-user-profile">
	<header class="user-identity">
		<span class="user-identity__avatar">
			{#if user.avatarUrl}<img src={user.avatarUrl} alt="" />{:else}<Icon name="fa-user" size="xlg" tone="muted" />{/if}
		</span>
		<div class="user-identity__copy">
			<div class="user-identity__labels">
				<span class="user-status" class:user-status--banned={status === "suspended"} class:user-status--pending={status === "awaitingApproval"}>
					<Icon name={status === "suspended" ? "fa-ban" : status === "enabled" ? "fa-circle-check" : "fa-hourglass-half"} size="sm" />
					{status === "suspended" ? "Banned" : accountStatusLabel(status)}
				</span>
				{#if user.isSuperadmin}<span class="user-role"><Icon name="fa-shield-halved" size="sm" />Superadmin</span>{/if}
			</div>
			<h2>{user.displayName}</h2>
			<p>@{user.username}<span>User #{user.id}</span></p>
		</div>
	</header>

	<AdminUserAccess {user} {saving} disabled={accountControlDisabled} onBan={onBanUser} onEnable={() => onAccountEnabled(true)} />

	<section class="profile-section" aria-label="Activity">
		<PanelHeader variant="section" title="Activity" />
		<TileGrid columns={2}>
			<Tile title="Last seen" subtitle={formatDate(user.lastSeen)} icon="fa-clock" iconTone="info" />
			<Tile title="Last login" subtitle={formatDate(user.lastLogin)} icon="fa-right-to-bracket" iconTone="accent" />
		</TileGrid>
	</section>

	<section class="profile-section" aria-label="Connected accounts">
		<PanelHeader variant="section" title="Connected accounts" />
		<div class="user-accounts">
			<div><Icon name="fa-discord" type="brands" size="lg" /><dl><dt>Discord ID</dt><dd>{user.discordId ?? "Not linked"}</dd></dl></div>
			<div><Icon name="fa-gamepad" size="lg" /><dl><dt>PlayFab ID</dt><dd>{user.playfabId ?? "Not set"}</dd></dl></div>
		</div>
	</section>

	<section class="profile-section" aria-label="Permissions">
		<PanelHeader variant="section" title="Permissions" />
		<div class="user-permission">
			<div><h3>Wanted creation</h3><p>Allow this user to add players to the Wanted list.</p></div>
			<Toggle label="Wanted creation" showLabel={false} checked={user.wantedCreationEnabled} disabled={saving} onChange={onWantedPermission} />
		</div>
		<div class="user-tags">
			{#each user.permissions as permission}<Tag label={permission} icon="fa-key" />{:else}<p>No additional system permissions.</p>{/each}
		</div>
	</section>

	<section class="profile-section" aria-label="Teams">
		<PanelHeader variant="section" title={`Teams (${user.teams.length})`} />
		{#if user.teams.length}
			<TileGrid columns={2}>
				{#each user.teams as team (team.id)}<Tile title={team.name} subtitle="View team" icon="fa-people-group" iconTone="info" onClick={() => onOpenTeam(team.id)} />{/each}
			</TileGrid>
		{:else}<p class="profile-empty">This user has not joined a team.</p>{/if}
	</section>

	<footer class="user-metadata">
		<span>Joined <strong>{formatDate(user.createdAt)}</strong></span>
		<span>Updated <strong>{formatDate(user.updatedAt)}</strong></span>
	</footer>
</div>

<style lang="scss">
	.admin-user-profile { display: grid; align-content: start; gap: var(--gutter-lg); }
	.user-identity { display: flex; align-items: center; gap: var(--gutter-lg); padding: var(--gutter-sm) 0; }
	.user-identity__avatar { width: 76px; height: 76px; flex: 0 0 auto; display: grid; place-items: center; overflow: hidden; border: 1px solid var(--color-dark-tertiary); border-radius: var(--radius-xl); background: rgbaa(var(--color-light-primary), 0.025); }
	.user-identity__avatar img { width: 100%; height: 100%; object-fit: cover; }
	.user-identity__copy { min-width: 0; display: grid; gap: var(--gutter-sm); }
	h2, h3, p, dl, dd { margin: 0; }
	h2 { font-size: var(--font-size-2xl); line-height: 1.2; overflow-wrap: anywhere; }
	.user-identity__copy p { display: flex; flex-wrap: wrap; gap: var(--gutter-md); color: var(--color-light-secondary); font-size: var(--font-size-sm); }
	.user-identity__copy p span { color: var(--color-light-tertiary); }
	.user-identity__labels { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gutter-md); }
	.user-status, .user-role { display: inline-flex; align-items: center; gap: 6px; font-size: var(--font-size-xs); font-weight: var(--font-weight-medium); }
	.user-status { color: var(--color-accent-secondary); }
	.user-status--banned { color: var(--color-accent-quaternary); }
	.user-status--pending { color: var(--color-accent-primary); }
	.user-role { color: var(--color-light-secondary); }
	.profile-section { min-width: 0; display: grid; gap: var(--gutter-md); }
	.user-accounts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gutter-md); }
	.user-accounts > div { display: flex; align-items: center; gap: var(--gutter-md); min-width: 0; border: 1px solid var(--color-dark-secondary); border-radius: var(--radius); padding: var(--gutter-md); }
	dl { min-width: 0; display: grid; gap: var(--gutter-sm); }
	dt { color: var(--color-light-secondary); font-size: var(--font-size-xs); }
	dd { overflow-wrap: anywhere; font-size: var(--font-size-sm); user-select: text; }
	.user-permission { display: flex; align-items: center; justify-content: space-between; gap: var(--gutter-lg); padding: var(--gutter-md); border: 1px solid var(--color-dark-secondary); border-radius: var(--radius); }
	h3 { font-size: var(--font-size-md); font-weight: var(--font-weight-medium); }
	.user-permission p, .profile-empty, .user-tags p { color: var(--color-light-tertiary); font-size: var(--font-size-sm); line-height: 1.5; }
	.user-permission p { margin-top: 5px; }
	.user-tags { display: flex; flex-wrap: wrap; gap: var(--gutter-sm); }
	.user-metadata { display: flex; flex-wrap: wrap; gap: var(--gutter-sm) var(--gutter-lg); border-top: 1px solid var(--color-dark-secondary); padding-top: var(--gutter-md); color: var(--color-light-tertiary); font-size: var(--font-size-xs); }
	.user-metadata strong { color: var(--color-light-secondary); font-weight: var(--font-weight); }
	@media (max-width: 520px) { .user-accounts { grid-template-columns: 1fr; } }
</style>
