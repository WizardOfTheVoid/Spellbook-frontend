<script lang="ts">
	import { onMount } from "svelte";
	import OffenseRemovalModal from "$lib/components/players/offenses/offenseRemovalModal.svelte";
	import type { PlayerState } from "$lib/types/playerState";
	import type { ActivePage } from "$lib/types/ui";
	import type { EvidenceItem, ProfileOwner } from "$lib/core";
	import EvidenceViewer from "$lib/components/players/evidenceViewer.svelte";
	import { authState } from "$lib/auth/user";
	import { resolveOverlayView } from "$lib/core";
	import type { NotificationInboxState } from "$lib/notifications/notificationInbox";
	import type {
		NotificationRecord,
		NotificationVisibility,
		TeamInvitationDecision,
	} from "@spellbook/shared/notifications";
	import { createPlayerArchiveSession } from "$lib/utils/playerArchive";
	import DashboardPanel from "$lib/components/dashboard/DashboardPanel.svelte";
	import LazyPanel from "./LazyPanel.svelte";
	import { schedulePanelPreload } from "./lazyPanelModules";
	import type { EvidencePlayerSelection } from "$lib/components/players/evidence/navigation";
	import type { TeamPanelLocation, TeamPanelTarget } from '$lib/teams/teamNavigation'

	export let activePage: ActivePage;
	export let operational = true;
	export let selectedPlayer: PlayerState | null;
	export let selectedPlayerSubpage: "notes" | null;
	export let openEvidenceId: number | null = null;
	export let openCandidateId: number | null = null;
	export let openCandidateEvidenceId: number | null = null;
	export let linkedEvidence: EvidenceItem | null = null;
	export let showEvidence = false;
	export let uploadPlayer: EvidencePlayerSelection | null = null;
	export let uploadRequestId = 0;
	export let onClearUploadRequest: () => void = () => {};
	export let onOpenCandidateHandled: () => void = () => {};
	export let onCloseLinkedEvidence: () => void = () => {};
	export let selectedOwner: ProfileOwner | null;
	export let selectedProfileId: number | null;
	export let profileOverviewRequestId = 0
	export let overlayVisible: boolean;
	export let serverName: string;
	export let serverExternalId: string | null;
	export let serverAddress: string | null;
	export let onSelectPlayer: (player: PlayerState) => void;
	export let onOpenPlayerProfile: (player: PlayerState) => void;
	export let onOpenWanted: (player: PlayerState) => void;
	export let onOpenPlayerNotes: (player: PlayerState) => void;
	export let onClearSelectedPlayer: () => void;
	export let onOpenProfile: (profileId: number, owner?: ProfileOwner) => void;
	export let onSelectProfile: (profileId: number | null) => void;
	export let onSelectOwner: (owner: ProfileOwner) => void;
	export let requestedTeamView: TeamPanelTarget | null
	export let onTeamLocation: (location: TeamPanelLocation) => void = () => {}
	export let requestedTeamId: number | null;
	export let requestedTeamRequestId: number | null;
	export let notificationState: NotificationInboxState;
	export let deletedNotificationState: NotificationInboxState;
	export let onRefreshNotifications: (
		visibility: NotificationVisibility,
	) => Promise<void>;
	export let onLoadMoreNotifications: (
		visibility: NotificationVisibility,
	) => Promise<void>;
	export let onRestoreNotification: (id: number) => Promise<void>;
	export let onDecideInvitation: (
		notification: NotificationRecord,
		decision: TeamInvitationDecision,
	) => Promise<void>;
	export let onSetNotificationRead: (
		id: number,
		read: boolean,
	) => Promise<void>;
	export let onMarkAllNotificationsRead: () => Promise<void>;
	export let onRemoveNotification: (id: number) => Promise<void>;
	export let onRemoveAllNotifications: () => Promise<void>;
	export let onOpenNotification: (
		notification: NotificationRecord,
	) => Promise<void>;
	export let onRequestedTeamHandled: (
		requestId: number,
		error?: unknown,
		applied?: boolean,
	) => void;
	export let requestedYoursRequestId: number | null;
	export let requestedServer: { id: number; requestId: number } | null;
	export let onRequestedServerHandled: (requestId: number) => void;
	export let onOpenServer: (serverId: number) => void;
	export let onOpenYourServers: () => void;
	export let onOpenSettings: () => void;
	export let onOpenTeams: () => void;
	export let onOpenTeam: (teamId: number, view?: `settings`) => void;
	export let onRequestedYoursHandled: (requestId: number) => void;

	let archiveUser = $authState.user;
	let wantedArchiveSession = createPlayerArchiveSession(`wanted`);

	$: if ($authState.user !== archiveUser) {
		archiveUser = $authState.user;
		wantedArchiveSession = createPlayerArchiveSession(`wanted`);
	}
	$: view = resolveOverlayView(activePage, selectedPlayer !== null);

	onMount(() => schedulePanelPreload(window));
</script>

{#if operational}<OffenseRemovalModal />{/if}

<aside class="content-sidebar" aria-label="Overlay content">
	<div class="content-sidebar-background-1"></div>

	{#if operational || view === `admin`}
		{#if view === "dashboard"}
			<DashboardPanel
				visible={overlayVisible}
				{onOpenYourServers}
				{onOpenServer}
				{onOpenTeam}
			/>
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
				{openEvidenceId}
				{showEvidence}
				{onOpenServer}
			/>
		{:else if view === "player" && selectedPlayer}
			<LazyPanel
				name="player"
				player={selectedPlayer}
				initialSubpage={selectedPlayerSubpage}
				{showEvidence}
				showCurrentGame={activePage !== `players`}
				{serverExternalId}
				{serverName}
				{serverAddress}
				backLabel={activePage === "players" ?
					"Back to database players"
				:	"Back to server players"}
				onBack={onClearSelectedPlayer}
				{onOpenServer}
				onOpenWanted={() => onOpenWanted(selectedPlayer!)}
			/>
		{:else if view === "server"}
			<LazyPanel
				name="server"
				{onOpenSettings}
				{onOpenTeam}
				isActive={overlayVisible}
				{onSelectPlayer}
				{onOpenProfile}
			/>
		{:else if view === "players"}
			<LazyPanel name="players" isActive={true} {onSelectPlayer} />
		{:else if view === "wanted"}
			<LazyPanel
				name="wanted"
				isActive={true}
				{onSelectPlayer}
				{onOpenPlayerProfile}
				session={wantedArchiveSession}
				{openCandidateId}
				{openCandidateEvidenceId}
				{onOpenCandidateHandled}
				{uploadPlayer}
				{uploadRequestId}
				{onClearUploadRequest}
			/>
		{:else if view === `actionRequests`}
			<LazyPanel name="actionRequests" />
		{:else if view === `playerForensics`}
			<LazyPanel name="playerForensics" />
		{:else if view === "profiles"}
			{#key profileOverviewRequestId}
			<LazyPanel
				name="profiles"
				isActive={true}
				{selectedOwner}
				{selectedProfileId}
				{onSelectProfile}
				{onSelectOwner}
			/>
			{/key}
		{:else if view === "servers"}
			<LazyPanel
				name="servers"
				isActive={overlayVisible}
				{requestedYoursRequestId}
				{onRequestedYoursHandled}
				{requestedServer}
				{onRequestedServerHandled}
				{onOpenServer}
			/>
		{:else if view === "notifications"}
			<LazyPanel
				name="notifications"
				isActive={overlayVisible}
				state={notificationState}
				deletedState={deletedNotificationState}
				onRestore={onRestoreNotification}
				{onDecideInvitation}
				onRefresh={onRefreshNotifications}
				onLoadMore={onLoadMoreNotifications}
				onSetRead={onSetNotificationRead}
				onMarkAllRead={onMarkAllNotificationsRead}
				onRemove={onRemoveNotification}
				onRemoveAll={onRemoveAllNotifications}
				onOpen={onOpenNotification}
			/>
		{:else if view === "settings"}
			<LazyPanel name="settings" />
		{:else if view === "account"}
			<LazyPanel name="account" {onOpenPlayerProfile} />
		{:else if view === "teams"}
			<LazyPanel
				name="teams"
				isActive={true}
				{requestedTeamView}
				{requestedTeamId}
				{requestedTeamRequestId}
				{onRequestedTeamHandled}
				onLocation={onTeamLocation}
			/>
		{:else if view === "admin" && $authState.user?.isSuperadmin}
			<LazyPanel name="admin" isActive={true} {onOpenTeam} {onOpenTeams} />
		{/if}
	{/if}
</aside>
{#if operational && linkedEvidence}<EvidenceViewer
		evidence={linkedEvidence}
		onClose={onCloseLinkedEvidence}
	/>{/if}

<style lang="scss">
	.content-sidebar {
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
		background: linear-gradient(
			165deg,
			rgbaa(var(--color-dark-secondary), 1) -5%,
			rgbaa(var(--color-dark-secondary), 0) 75%
		);
		opacity: 0.3;
		mix-blend-mode: lighten;
		user-select: none;
		pointer-events: none;
	}
</style>
