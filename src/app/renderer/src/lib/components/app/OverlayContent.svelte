<script lang="ts">
	import { onMount } from "svelte"
	import type { PlayerState } from "$lib/types/playerState"
	import type { ActivePage, ServerSummary } from "$lib/types/ui"
	import type { ProfileOwner } from "$lib/core"
	import { authState } from "$lib/auth/user"
	import { resolveOverlayView } from "$lib/core"
	import type { NotificationInboxState } from "$lib/notifications/notificationInbox"
	import type { NotificationRecord } from "@spellbook/shared/notifications"
	import { createPlayerArchiveSession } from "$lib/utils/playerArchive"
	import DashboardPanel from "$lib/components/dashboard/DashboardPanel.svelte"
	import LazyPanel from "./LazyPanel.svelte"
	import { schedulePanelPreload } from "./lazyPanelModules"

	export let activePage: ActivePage
	export let selectedPlayer: PlayerState | null
	export let selectedPlayerSubpage: "notes" | null
	export let selectedOwner: ProfileOwner | null
	export let selectedProfileId: number | null
	export let overlayVisible: boolean
	export let serverName: string
	export let serverExternalId: string | null
	export let serverAddress: string | null
	export let onSelectPlayer: (player: PlayerState) => void
	export let onOpenPlayerProfile: (player: PlayerState) => void
	export let onOpenPlayerNotes: (player: PlayerState) => void
	export let onClearSelectedPlayer: () => void
	export let onOpenProfile: (profileId: number, owner?: ProfileOwner) => void
	export let onSelectProfile: (profileId: number | null) => void
	export let onSelectOwner: (owner: ProfileOwner) => void
	export let onServerSummaryChange: (summary: ServerSummary) => void
	export let requestedTeamView: `requests` | null
	export let onManageProfiles: (teamId: number) => void
	export let requestedTeamId: number | null
	export let requestedTeamRequestId: number | null
	export let notificationState: NotificationInboxState
	export let onRefreshNotifications: () => Promise<void>
	export let onSetNotificationRead: (id: number, read: boolean) => Promise<void>
	export let onMarkAllNotificationsRead: () => Promise<void>
	export let onRemoveNotification: (id: number) => Promise<void>
	export let onOpenNotification: (notification: NotificationRecord) => Promise<void>
	export let onRequestedTeamHandled: (requestId: number, error?: unknown) => void
	export let requestedYoursRequestId: number | null
	export let onOpenYourServers: () => void
	export let onRequestedYoursHandled: (requestId: number) => void

	let archiveUser = $authState.user
	let wantedArchiveSession = createPlayerArchiveSession()

	$: if ($authState.user !== archiveUser) {
		archiveUser = $authState.user
		wantedArchiveSession = createPlayerArchiveSession()
	}
	$: view = resolveOverlayView(activePage, selectedPlayer !== null)

	onMount(() => schedulePanelPreload(window))
</script>

<aside class="content-sidebar" aria-label="Overlay content">
	<div class="content-sidebar-background-1"></div>

	{#if view === "dashboard"}
		<DashboardPanel {onOpenYourServers} />
	{:else if view === "wanted-player" && selectedPlayer}
		<LazyPanel
			name="wanted-player"
			player={selectedPlayer}
			{serverExternalId}
			{serverName}
			{serverAddress}
			onBack={onClearSelectedPlayer}
			onOpenProfile={() => onOpenPlayerProfile(selectedPlayer!)}
			onOpenNotes={() => onOpenPlayerNotes(selectedPlayer!)}
		/>
	{:else if view === "player" && selectedPlayer}
		<LazyPanel
			name="player"
			player={selectedPlayer}
			initialSubpage={selectedPlayerSubpage}
			{serverExternalId}
			{serverName}
			{serverAddress}
			backLabel={activePage === "players" ? "Back to database players" : "Back to server players"}
			onBack={onClearSelectedPlayer}
		/>
	{:else if view === "server"}
		<LazyPanel
			name="server"
			isActive={overlayVisible}
			{onSelectPlayer}
			{onOpenProfile}
			onSummaryChange={onServerSummaryChange}
		/>
	{:else if view === "players"}
		<LazyPanel name="players" isActive={true} {onSelectPlayer} />
	{:else if view === "wanted"}
		<LazyPanel name="wanted" isActive={true} {onSelectPlayer} {onOpenPlayerProfile} session={wantedArchiveSession} />
	{:else if view === "profiles"}
		<LazyPanel name="profiles" {onOpenYourServers} isActive={true} {selectedOwner} {selectedProfileId} {onSelectProfile} {onSelectOwner} />
	{:else if view === "servers"}
		<LazyPanel name="servers" isActive={true} {requestedYoursRequestId} {onRequestedYoursHandled} />
	{:else if view === "notifications"}
		<LazyPanel
			name="notifications"
			state={notificationState}
			onRefresh={onRefreshNotifications}
			onSetRead={onSetNotificationRead}
			onMarkAllRead={onMarkAllNotificationsRead}
			onRemove={onRemoveNotification}
			onOpen={onOpenNotification}
		/>
	{:else if view === "settings"}
		<LazyPanel name="settings" />
	{:else if view === "account"}
		<LazyPanel name="account" />
	{:else if view === "teams"}
		<LazyPanel
			name="teams"
			isActive={true}
			{requestedTeamView}
			{onManageProfiles}
			{requestedTeamId}
			{requestedTeamRequestId}
			{onRequestedTeamHandled}
		/>
	{:else if view === "admin" && $authState.user?.isSuperadmin}
		<LazyPanel name="admin" isActive={true} />
	{/if}
</aside>

<style lang="scss">
	.content-sidebar {
		position: relative;
		z-index: 2;
		min-width: 0;
		min-height: 0;
		border-radius: var(--radius-xl);
		background: var(--color-dark-primary);
		box-shadow: 0 0 90px rgbaa(var(--color-dark-primary), 0.5);
		overflow: hidden;
	}
	.content-sidebar-background-1 {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		z-index: 0;
		background: linear-gradient(165deg, rgbaa(var(--color-dark-secondary), 1) -5%, rgbaa(var(--color-dark-secondary), 0) 75%);
		opacity: 0.25;
		mix-blend-mode: lighten;
		user-select: none;
		pointer-events: none;
	}
</style>
