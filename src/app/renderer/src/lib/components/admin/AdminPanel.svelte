<script lang="ts">
	import type { AdminUserRecord, TickAction } from "$lib/core"
	import { authState, loadSession } from "$lib/auth/user"
	import { notifyError, notifySuccess } from "$lib/notifications/notificationEvents"
	import { unwrap } from "$lib/utils/apiResult"
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte"
	import Tile from "$lib/components/ui/Tile.svelte"
	import TileGrid from "$lib/components/ui/TileGrid.svelte"
	import HealthPanel from "$lib/components/health/HealthPanel.svelte"
	import AdminTeamsPanel from "./AdminTeamsPanel.svelte"
	import AdminUserDetail from "./AdminUserDetail.svelte"
	import AdminUsersPanel from "./AdminUsersPanel.svelte"
	import BanUserModal from "./BanUserModal.svelte"
	import { canBanAdminUser } from "./adminUserBan"
	import AuditLogsPanel from "./AuditLogsPanel.svelte"
	import IntegrationTestsPanel from "./IntegrationTestsPanel.svelte"
	import NotificationTestsPanel from "./NotificationTestsPanel.svelte"
	import TickActionsPanel from "./TickActionsPanel.svelte"
	import { adminBack, adminRootTiles, type AdminRootView, type AdminView } from "./adminNavigation"
	import type { Component } from "svelte"

	export let hidden = false
	export let isActive = false

	let view: AdminView = "root"
	let selectedUser: AdminUserRecord | null = null
	let selectedTeamId: number | null = null
	let selectedTickAction: TickAction | null = null
	let saving = false
	let banTarget: AdminUserRecord | null = null
	let usersPanel: AdminUsersPanel | undefined
	let devComponent: Component | null = null

	$: rootTiles = adminRootTiles(import.meta.env.DEV)
	$: title = view === "root" ? "Admin"
		: view === "users" ? "Users"
		: view === "teams" ? "Teams"
		: view === "team" ? "Team"
		: view === "audit-logs" ? "Audit Logs"
		: view === "integration-tests" ? "Integration tests"
		: view === "notification-tests" ? "Notification tests"
		: view === "tick-actions" ? "Tick Actions"
		: view === "dev-grid" ? "GRID"
		: view === "dev-ui" ? "UI components"
		: selectedUser?.displayName ?? "User"

	async function openRootView(nextView: AdminRootView): Promise<void> {
		if (nextView === "dev-grid" || nextView === "dev-ui") {
			if (!import.meta.env.DEV) return
			devComponent = nextView === "dev-ui"
				? (await import("$lib/components/dev/UiGalleryPanel.svelte")).default
				: null
		}
		view = nextView
	}

	async function openUser(userId: number): Promise<void> {
		try {
			selectedUser = await unwrap<AdminUserRecord>(
				await window.chivServer.admin.users.get(userId),
				"User request failed.",
			)
			view = "user"
		} catch (error) {
			notifyError(message(error, "User request failed."))
		}
	}

	function openTeam(teamId: number): void {
		selectedTeamId = teamId
		view = "team"
	}

	async function setWantedPermission(enabled: boolean): Promise<void> {
		if (!selectedUser) return
		const userId = selectedUser.id
		saving = true
		try {
			await unwrap<unknown>(
				await window.chivServer.admin.users.setWantedPermission(userId, enabled),
				"Wanted permission update failed.",
			)
			selectedUser = await unwrap<AdminUserRecord>(
				await window.chivServer.admin.users.get(userId),
				"User refresh failed.",
			)
			if (userId === $authState.user?.id) await loadSession()
			notifySuccess(`Wanted creation ${enabled ? "enabled" : "disabled"} for ${selectedUser.displayName}.`)
		} catch (error) {
			notifyError(message(error, "Wanted permission update failed."))
		} finally {
			saving = false
		}
	}

	async function setAccountEnabled(enabled: boolean): Promise<void> {
		if (!selectedUser || selectedUser.id === $authState.user?.id) return
		const userId = selectedUser.id
		const accountName = selectedUser.displayName
		const action = selectedUser.bannedAt ? `unbanned` : `approved`
		saving = true
		try {
			await unwrap<unknown>(
				await window.chivServer.admin.users.setAccountEnabled(userId, enabled),
				"Account access update failed.",
			)
			await openUser(userId)
			notifySuccess(`${accountName} ${enabled ? action : `suspended`}.`)
		} catch (error) {
			notifyError(message(error, "Account access update failed."))
		} finally {
			saving = false
		}
	}

	function openBanUser(user: AdminUserRecord): void {
		if (canBanAdminUser($authState.user, user)) banTarget = user
	}

	function userBanned(user: AdminUserRecord): void {
		banTarget = null
		if (view === `users`) usersPanel?.refresh()
		if (view === `user` && selectedUser?.id === user.id) void openUser(user.id)
	}

	function back(): void {
		if (view === "tick-actions") {
			const state = adminBack({ view, selectedAction: selectedTickAction })
			view = state.view
			selectedTickAction = state.selectedAction
			return
		}
		if (view === "user") {
			view = "users"
			selectedUser = null
			return
		}
		if (view === "team") {
			view = "teams"
			selectedTeamId = null
			return
		}
		view = "root"
		devComponent = null
		selectedTeamId = null
	}

	function message(error: unknown, fallback: string): string {
		return error instanceof Error ? error.message : fallback
	}
</script>

{#if view === "health"}
	<HealthPanel {hidden} isActive={isActive} onBack={back} />
{:else}
	<section {hidden} class="panel-view admin-panel" aria-label="Admin">
		<PanelHeader
			{title}
			eyebrow={view === "root" ? "System" : view.startsWith("dev-") ? "Development" : view === "user" ? "User" : "Admin"}
			leadingIcon={view === "root" ? null : "fa-arrow-left"}
			leadingLabel={view === "user" ? "Back to users"
				: view === "team" ? "Back to teams"
				: view === "tick-actions" && selectedTickAction ? "Back to tick actions"
				: "Back to admin"}
			onLeading={view === "root" ? null : back}
		/>

		{#if view === "root"}
			<div class="admin-root panel-subview">
				<TileGrid columns={1}>
					{#each rootTiles as tile (tile.view)}
						<Tile
							title={tile.title}
							subtitle={tile.subtitle}
							icon={tile.icon}
							iconTone={tile.iconTone ?? "default"}
							onClick={() => void openRootView(tile.view)}
						/>
					{/each}
				</TileGrid>
			</div>
		{:else if view === "users"}
			<div class="admin-users panel-subview">
				<AdminUsersPanel bind:this={usersPanel} active={isActive} onOpenUser={(userId) => void openUser(userId)} onBanUser={openBanUser} />
			</div>
		{:else if view === "teams" || view === "team"}
			<div class="admin-teams panel-subview">
				<AdminTeamsPanel
					active={isActive}
					{selectedTeamId}
					onSelectedTeam={(teamId) => {
						selectedTeamId = teamId
						view = teamId === null ? "teams" : "team"
					}}
				/>
			</div>
		{:else if view === "audit-logs"}
			<div class="admin-audit-logs panel-subview"><AuditLogsPanel active={isActive} /></div>
		{:else if view === "integration-tests"}
			<div class="admin-integration-tests panel-subview"><IntegrationTestsPanel /></div>
		{:else if view === "notification-tests"}
			<div class="admin-notification-tests panel-subview"><NotificationTestsPanel /></div>
		{:else if view === "tick-actions"}
			<div class="admin-tick-actions panel-subview">
				<TickActionsPanel active={isActive} bind:selectedAction={selectedTickAction} />
			</div>
		{:else if view === "dev-grid" || view === "dev-ui"}
			<div class="admin-dev panel-subview">
				{#if view === "dev-grid"}
					<iframe class="admin-dev__grid" src="/dev/grid" title="GRID reference"></iframe>
				{:else if devComponent}
					<svelte:component this={devComponent} />
				{/if}
			</div>
		{:else if selectedUser}
			<div class="admin-user panel-subview">
				<AdminUserDetail
					user={selectedUser}
					{saving}
					accountControlDisabled={!$authState.user?.isSuperadmin || selectedUser.id === $authState.user?.id}
					onWantedPermission={(enabled) => void setWantedPermission(enabled)}
					onAccountEnabled={(enabled) => void setAccountEnabled(enabled)}
					onBanUser={() => selectedUser && openBanUser(selectedUser)}
					onOpenTeam={openTeam}
				/>
			</div>
		{/if}
	</section>
{/if}

{#if banTarget}
	<BanUserModal user={banTarget} onBanned={userBanned} onCancel={() => banTarget = null} />
{/if}

<style lang="scss">
	.admin-panel {
		box-sizing: border-box;
		height: 100%;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		gap: var(--gutter-lg);
		padding-top: var(--gutter-lg);
	}
	.admin-root,
	.admin-users,
	.admin-user,
	.admin-teams,
	.admin-audit-logs,
	.admin-integration-tests,
	.admin-notification-tests,
	.admin-tick-actions,
	.admin-dev {
		min-height: 0;
		padding: 0 var(--gutter-lg) var(--gutter-lg);
		overflow: auto;
	}
	.admin-dev :global(.panel-view),
	.admin-dev :global(.page) { min-height: 100%; }
	.admin-dev__grid {
		width: 100%;
		height: 100%;
		min-height: 640px;
		border: 0;
		background: var(--color-dark-primary);
	}
</style>
