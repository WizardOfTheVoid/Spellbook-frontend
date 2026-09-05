<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import { getOverlayApi, getServerApi } from "$lib/core";
	import { SnapshotLookupController } from "$lib/snapshot/snapshotLookupController";
	import type { PlayerState } from "$lib/types/playerState";
	import { loadSettings } from "$lib/settings/settings-store";
	import { hasFocusedEditableElement } from "$lib/utils/dom";
	import {
		authState,
		listenForSessionChanges,
		loadSession,
		logout,
		startupState,
	} from "$lib/auth/user";
	import type { ProfileOwner } from "$lib/core";
	import type { ActivePage, LoadState, ServerSummary } from "$lib/types/ui";
	import AmbientStage from "$lib/components/app/AmbientStage.svelte";
	import QuickActions from "$lib/components/app/QuickActions.svelte";
	import NavRail from "$lib/components/navigation/NavRail.svelte";
	import OverlayContent from "$lib/components/app/OverlayContent.svelte";
	import AuthScreen from "$lib/components/auth/AuthScreen.svelte";
	import StartupOverlay from "$lib/components/auth/StartupOverlay.svelte"
	import {
		createNotificationNavigationIntent,
		createNotificationNavigationLifecycle,
		createNotificationNavigationReset,
		createTeamNavigationHandoff,
		openNotificationTarget,
	} from "$lib/notifications/notificationNavigation"
	import { createNotificationInbox } from "$lib/notifications/notificationInbox"
	import { createNotificationInboxSession } from "$lib/notifications/notificationInboxSession"
	import { notificationEvents, notify, notifyError } from "$lib/notifications/notificationEvents"
	import { presentNotificationArrival } from "$lib/notifications/notificationPresentation"
	import { playCustomSFX } from "$lib/global/sfx"
	import { createOverlayVisibilitySfx } from "$lib/global/sfx/overlayVisibilitySfx"
	import { fetchPlayerProfile } from "$lib/utils/serverProfilesApi"
	import { createDbPlayerState } from "$lib/utils/playerStateData"
	import type { NotificationRecord } from "@spellbook/shared/notifications"
	import { schedulePanelPreload } from "$lib/components/app/lazyPanelModules"
	import { warmAuthenticatedCaches } from "$lib/utils/cacheWarmup"
	import {
		stopGameProcessAvailability,
		syncGameProcessAvailability,
	} from "$lib/stores/gameProcessAvailabilityStore"
	import { playerNotesNavigationTarget } from "$lib/components/players/playerDetailNavigation"
	import { startAppUpdatePolling } from "$lib/utils/appUpdatePolling"

	let activePage: ActivePage = "dashboard";
	let selectedPlayer: PlayerState | null = null;
	let selectedPlayerSubpage: "notes" | null = null;
	let overlayVisible = false;
	const syncOverlayVisibilitySfx = createOverlayVisibilitySfx(cue => SFX.play(cue))
	let frameReady = false;
	let revealTimer: number | null = null;
	let serverName = "Current game server";
	let serverExternalId: string | null = null;
	let serverAddress: string | null = null;
	let serverDisplayName = "Current game server";
	let playerState: LoadState = "idle";
	let selectedProfileId: number | null = null;
	let selectedOwner: ProfileOwner | null = null;
	let requestedTeamId: number | null = null
	let requestedTeamRequestId: number | null = null
	let requestedYoursRequestId: number | null = null
	let serverNavigationSequence = 0
	let warmedUserId: number | null = null
	let latestVersion: string | null = null
	let cancelCacheWarmup: () => void = () => {}
	const teamNavigation = createTeamNavigationHandoff((request) => {
		requestedTeamId = request?.teamId ?? null
		requestedTeamRequestId = request?.requestId ?? null
	})
	const notificationNavigationIntent = createNotificationNavigationIntent()
	const resetNotificationNavigation = createNotificationNavigationReset(
		notificationNavigationIntent,
		teamNavigation.reset,
	)
	const notificationNavigationLifecycle = createNotificationNavigationLifecycle(
		resetNotificationNavigation,
		() => {
			selectedPlayer = null
			selectedPlayerSubpage = null
			notificationEvents.clear()
		},
	)
	const notificationInboxSession = createNotificationInboxSession(
		async () => createNotificationInbox(
			getServerApi(),
			await getOverlayApi().notificationPollMs(),
			(notification, context) => presentNotificationArrival(notification, {
				isCurrent: context.isCurrent,
				notify,
				playSfx: playCustomSFX,
				setRead: notificationInboxSession.setRead,
				open: openNotification,
			}),
		),
		(error) => notifyError(
			error instanceof Error ? error.message : `Notification inbox failed to start.`,
			{ dedupeKey: `notifications:start` },
		),
		notificationNavigationLifecycle.reset,
	)

	$: if ($authState.user && !selectedOwner) {
		selectedOwner = { type: "user", id: $authState.user.id };
	}

	$: scheduleReveal(overlayVisible);
	$: appUserId = $authState.user?.isActive && $authState.user.onboardingComplete
		? $authState.user.id : null
	$: void notificationInboxSession.sync(
		appUserId,
	)
	$: syncGameProcessAvailability(
		$startupState.phase === "authenticated"
			&& appUserId !== null
			&& overlayVisible,
	)
	$: if (appUserId !== warmedUserId) {
		cancelCacheWarmup()
		warmedUserId = appUserId
		if (warmedUserId !== null && typeof window !== "undefined") {
			cancelCacheWarmup = schedulePanelPreload(
				window,
				() => warmAuthenticatedCaches(getServerApi()),
			)
		}
	}

	onMount(() => {
		let unsubscribeOverlayVisibility: (() => void) | undefined;
		const publishTextInputState = (target: EventTarget | null): void => {
			const element = target instanceof Element ? target : null;
			try {
				getOverlayApi().setTextInputActive(hasFocusedEditableElement(element));
			} catch {
				// Browser-only development has no Electron preload bridge.
			}
		};
		const handleFocusIn = (event: FocusEvent) =>
			publishTextInputState(event.target);
		const handleFocusOut = (event: FocusEvent) =>
			publishTextInputState(event.relatedTarget);
		const unsubscribeAuth = listenForSessionChanges();
		const stopUpdatePolling = startAppUpdatePolling(
			() => getOverlayApi().checkForUpdate(),
			version => { latestVersion = version },
			window,
		)

		void loadSettings();
		void loadSession();
		document.addEventListener(`focusin`, handleFocusIn);
		document.addEventListener(`focusout`, handleFocusOut);
		publishTextInputState(document.activeElement);
		void initializeOverlayVisibility((unsubscribe) => {
			unsubscribeOverlayVisibility = unsubscribe;
		});

		const unsubscribeSnapshotLookup = listenForSnapshotLookups();

		return () => {
			document.removeEventListener(`focusin`, handleFocusIn);
			document.removeEventListener(`focusout`, handleFocusOut);
			publishTextInputState(null);
			unsubscribeOverlayVisibility?.();
			unsubscribeSnapshotLookup?.();
			unsubscribeAuth();
			stopUpdatePolling()
		};
	});

	onDestroy(() => {
		clearRevealTimer()
		cancelCacheWarmup()
		notificationInboxSession.stop()
		stopGameProcessAvailability()
	})

	function listenForSnapshotLookups(): (() => void) | undefined {
		try {
			return new SnapshotLookupController(showPlayer).listen();
		} catch {
			return undefined;
		}
	}

	function showPlayer(player: PlayerState): void {
		resetNotificationNavigation()
		activePage = "server";
		selectedProfileId = null;
		selectedPlayer = player;
		selectedPlayerSubpage = null;
	}

	function selectPage(page: ActivePage): boolean {
		resetNotificationNavigation()
		return applyPage(page)
	}

	function openYourServers(): void {
		resetNotificationNavigation()
		if (!applyPage(`servers`)) return
		requestedYoursRequestId = ++serverNavigationSequence
	}

	function handleYoursRequest(requestId: number): void {
		if (requestedYoursRequestId === requestId) requestedYoursRequestId = null
	}

	function applyPage(page: ActivePage): boolean {
		if (page === "admin" && !$authState.user?.isSuperadmin) return false;
		if (page !== `servers`) requestedYoursRequestId = null
		activePage = page;
		selectedPlayer = null;
		selectedPlayerSubpage = null;
		if (page !== "profiles") selectedProfileId = null;
		return true
	}

	async function openNotification(notification: NotificationRecord): Promise<void> {
		const uri = notification.callback?.uri ?? ""
		resetNotificationNavigation()
		await openNotificationTarget(uri, {
			selectPage: applyPage,
			selectTeam: teamNavigation.request,
			openWantedPlayer: async (playfabId) => {
				await notificationNavigationIntent.run(
					() => fetchPlayerProfile(playfabId),
					(profile) => { selectedPlayer = createDbPlayerState(profile.player) },
				)
			},
			openPlayerNotes: async (playfabId) => {
				await notificationNavigationIntent.run(
					() => fetchPlayerProfile(playfabId),
					(profile) => {
						selectedPlayer = createDbPlayerState(profile.player)
						selectedPlayerSubpage = "notes"
					},
				)
			},
			invalid: () => {
				notifyError("Notification target could not be opened.", {
					dedupeKey: `notification:${notification.id}:callback`,
				})
			},
		})
	}

	function openProfile(profileId: number, owner?: ProfileOwner): void {
		resetNotificationNavigation()
		if (owner) selectedOwner = owner;
		activePage = "profiles";
		selectedPlayer = null;
		selectedPlayerSubpage = null;
		selectedProfileId = profileId;
	}

	function selectPlayer(player: PlayerState | null): void {
		resetNotificationNavigation()
		selectedPlayer = player
		selectedPlayerSubpage = null
	}

	function openPlayerProfile(player: PlayerState): void {
		resetNotificationNavigation()
		activePage = "players"
		selectedPlayer = player
		selectedPlayerSubpage = null
	}

	function openPlayerNotes(player: PlayerState): void {
		resetNotificationNavigation()
		const target = playerNotesNavigationTarget(player)
		activePage = target.page
		selectedPlayer = target.player
		selectedPlayerSubpage = target.subpage
	}

	function selectProfile(profileId: number | null): void {
		resetNotificationNavigation()
		selectedProfileId = profileId
	}

	function selectOwner(owner: ProfileOwner): void {
		resetNotificationNavigation()
		selectedOwner = owner
	}

	async function initializeOverlayVisibility(
		setUnsubscribe: (unsubscribe: () => void) => void,
	): Promise<void> {
		try {
			const overlayApi = getOverlayApi();
			setOverlayVisibility(await overlayApi.isVisible());
			setUnsubscribe(
				overlayApi.onVisibilityChange(setOverlayVisibility),
			);
		} catch {
			setOverlayVisibility(document.visibilityState === "visible");
		}
	}

	function setOverlayVisibility(visible: boolean): void {
		overlayVisible = visible
		syncOverlayVisibilitySfx(visible)
	}

	async function hideOverlay(): Promise<void> {
		try {
			await getOverlayApi().hide();
		} catch {
			setOverlayVisibility(false);
		}
	}

	async function openUpdatePage(): Promise<void> {
		try {
			await getOverlayApi().openUpdatePage()
		} catch {
			notifyError(`The SpellBook update page could not be opened.`, {
				dedupeKey: `update:open`,
			})
		}
	}

	function updateServerSummary(summary: ServerSummary): void {
		serverExternalId = summary.serverExternalId;
		serverName = summary.serverName;
		serverAddress = summary.serverAddress;
		serverDisplayName = summary.serverDisplayName;
		playerState = summary.playerState;
	}

	function scheduleReveal(isVisible: boolean): void {
		clearRevealTimer();

		if (!isVisible || typeof window === "undefined") {
			frameReady = false;
			return;
		}

		frameReady = false;
		revealTimer = window.setTimeout(() => {
			frameReady = true;
			revealTimer = null;
		}, 100);
	}

	function clearRevealTimer(): void {
		if (revealTimer === null || typeof window === "undefined") return;
		window.clearTimeout(revealTimer);
		revealTimer = null;
	}
</script>

{#if $startupState.phase === "starting" || $startupState.phase === "restoring-session"}
	<StartupOverlay />
{:else if !$authState.user || !$authState.user.isActive || !$authState.user.onboardingComplete}
	<AuthScreen
		user={$authState.user}
		startupError={$startupState.error}
		startupErrorCode={$startupState.errorCode}
		onClose={() => void hideOverlay()}
	/>
{:else}
	<main
		class="overlay-shell"
		class:overlay-shell--visible={frameReady}
		class:overlay-shell--dashboard={activePage === "dashboard"}
		class:overlay-shell--servers={activePage === "servers"}
	>
		<button
			class="app-bg"
			type="button"
			tabindex="-1"
			aria-label="Minimize SpellBook to tray"
			on:click={() => void hideOverlay()}
		></button>

		<NavRail
			{activePage}
			{serverDisplayName}
			{latestVersion}
			notificationCount={$notificationInboxSession.unreadCount}
			user={$authState.user}
			onSelectPage={selectPage}
			onOpenUpdate={() => void openUpdatePage()}
			onLogout={() => notificationNavigationLifecycle.leave(logout)}
		/>

		<AmbientStage />

		<QuickActions
			user={$authState.user}
			{serverExternalId}
			{serverName}
		/>

		<OverlayContent
			{activePage}
			{selectedPlayer}
			{selectedPlayerSubpage}
			{selectedOwner}
			{selectedProfileId}
			{overlayVisible}
			{serverExternalId}
			{serverName}
			{serverAddress}
			{requestedTeamId}
			{requestedTeamRequestId}
			{requestedYoursRequestId}
			notificationState={$notificationInboxSession}
			onRefreshNotifications={notificationInboxSession.refresh}
			onSetNotificationRead={notificationInboxSession.setRead}
			onMarkAllNotificationsRead={notificationInboxSession.markAllRead}
			onRemoveNotification={notificationInboxSession.remove}
			onOpenNotification={openNotification}
			onRequestedTeamHandled={teamNavigation.handled}
			onOpenYourServers={openYourServers}
			onRequestedYoursHandled={handleYoursRequest}
			onSelectPlayer={(player) => selectPlayer(player)}
			onOpenPlayerProfile={openPlayerProfile}
			onOpenPlayerNotes={openPlayerNotes}
			onClearSelectedPlayer={() => selectPlayer(null)}
			onOpenProfile={openProfile}
			onSelectProfile={selectProfile}
			onSelectOwner={selectOwner}
			onServerSummaryChange={updateServerSummary}
		/>
	</main>
{/if}
