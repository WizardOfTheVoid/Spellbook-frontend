<script lang="ts">
	import { cancelNotificationRequest } from "$lib/notifications/cancelNotificationRequest";
	import { canOpenContent } from '$lib/components/content/contentAccess'
	import {
		navigation,
		rememberNavigation,
		navigateBack,
	} from "$lib/navigation/navigation";
	import { onDestroy, onMount, tick } from "svelte";
	import { get } from "svelte/store";
	import {
		maintenanceSession,
		maintenanceAdminOpen,
		canUseMaintenanceAdmin,
	} from "$lib/maintenance/maintenanceSession";
	import { maintenanceOperational } from "../../../shared/maintenance";
	import MaintenanceSurface from "$lib/maintenance/maintenanceSurface.svelte";
	import { getOverlayApi, getServerApi } from "$lib/core";
	import { SnapshotLookupController } from "$lib/snapshot/snapshotLookupController";
	import { recordPlayerDetection } from '$lib/snapshot/playerDetectionRuns'
	import { visitSnapshotPlayer } from '$lib/snapshot/snapshotPlayerNavigation'
	import type { PlayerState } from "$lib/types/playerState";
	import { loadSettings } from "$lib/settings/settings-store";
	import { observeOverlayInputFocus } from "$lib/utils/overlayInputFocus"
	import {
		authState,
		User,
		listenForSessionChanges,
		loadSession,
		needsPlayfabId,
		logout,
		startupState,
	} from "$lib/auth/user";
	import type { EvidenceItem, ProfileOwner } from "$lib/core";
	import type { ActivePage, LoadState, ServerSummary } from "$lib/types/ui";
	import AmbientStage from "$lib/components/app/AmbientStage.svelte";
	import QuickActions from "$lib/components/app/QuickActions.svelte";
	import MenuBar from "$lib/components/navigation/menuBar.svelte";
	import { currentTeam, currentTeamState } from '$lib/teams/currentTeamStore'
	import { getTeamContentId, visitTeamTarget, type TeamNavigationTarget, type TeamPanelLocation, type TeamPanelTarget } from '$lib/teams/teamNavigation'
	import OverlayContent from "$lib/components/app/OverlayContent.svelte";
  import OverlayBackdrop from '$lib/components/app/overlayBackdrop.svelte'
	import AuthScreen from "$lib/components/auth/AuthScreen.svelte";
	import StartupOverlay from "$lib/components/auth/StartupOverlay.svelte";
	import {
		createNotificationNavigationIntent,
		createNotificationNavigationLifecycle,
		createNotificationNavigationReset,
		createTeamNavigationHandoff,
		openNotificationTarget,
	} from "$lib/notifications/notificationNavigation";
	import { createNotificationInbox } from "$lib/notifications/notificationInbox";
	import { createNotificationInboxSession } from "$lib/notifications/notificationInboxSession";
	import {
		notificationEvents,
		notify,
		notifyError,
	} from "$lib/notifications/notificationEvents";
	import { presentNotificationArrival } from "$lib/notifications/notificationPresentation";
	import { createOverlayVisibilitySfx } from "$lib/global/sfx/overlayVisibilitySfx";
	import {
		fetchPlayerProfile,
		fetchProfileOwners,
	} from "$lib/utils/serverProfilesApi";
	import { unwrap } from "$lib/utils/apiResult";
	import { createDbPlayerState } from "$lib/utils/playerStateData";
	import type {
		NotificationRecord,
		NotificationVisibility,
		NotificationMutation,
		TeamInvitationDecision,
	} from "@spellbook/shared/notifications";
	import { schedulePanelPreload } from "$lib/components/app/lazyPanelModules";
	import { warmAuthenticatedCaches } from "$lib/utils/cacheWarmup";
	import {
		stopGameProcessAvailability,
		syncGameProcessAvailability,
	} from "$lib/stores/gameProcessAvailabilityStore";
	import { playerNotesNavigationTarget } from "$lib/components/players/playerDetailNavigation";
	import AppUpdatePanel from "$lib/appUpdates/appUpdatePanel.svelte"
	import { unsavedChanges } from "$lib/utils/unsavedChanges";
	import { pendingTeamRequests } from "$lib/stores/pendingTeamRequests";
	import { consoleSetup, consoleSetupPreview, consoleSetupModalOpen } from '$lib/consoleSetup/consoleSetupStore'
	import { closeInfinityMenu } from "$lib/components/ui/infinityMenu";
	import ConsoleIssueStatus from "$lib/consoleSetup/consoleIssueStatus.svelte";
  import ConsoleSetupGate from '$lib/consoleSetup/consoleSetupGate.svelte'
  import { resolveSetupView } from '$lib/consoleSetup/consoleSetupNavigation'
	import {
		currentServer,
		currentServerSummary,
	} from "$lib/gameState/currentServerStore";
	import { gameServerRevision } from "$lib/stores/gameServersStore";
	import { profilePreferencesState } from "$lib/stores/profilePreferencesStore";
	import {
		openPendingPlayerLink,
		visitPlayerLink,
	} from "$lib/appLinks/playerLinkNavigation";
	import { getLinkedEvidence } from "$lib/utils/evidenceApi";
	import { getWantedCandidate } from "$lib/utils/wantedCandidateApi";
	import {
		clearEvidenceNavigation,
		evidenceNavigationRequest,
		type EvidenceNavigationRequest,
		type EvidencePlayerSelection,
	} from "$lib/components/players/evidence/navigation";

	let activePage: ActivePage = "dashboard";
	let maintenanceSignIn = false;
	let wasOperational = false;
	let selectedPlayer: PlayerState | null = null;
	let selectedPlayerSubpage: `notes` | `actions` | null = null;
	let openEvidenceId: number | null = null;
	let openCandidateId: number | null = null;
	let openCandidateEvidenceId: number | null = null;
	let linkedEvidence: EvidenceItem | null = null;
	let showEvidence = false;
	let uploadPlayer: EvidencePlayerSelection | null = null;
	let uploadRequestId = 0;
	let overlayVisible = false;
	const syncOverlayVisibilitySfx = createOverlayVisibilitySfx((cue) =>
		SFX.play(cue),
	);
	let frameReady = false;
	let revealTimer: number | null = null;
	let serverName = "Current game server";
	let serverExternalId: string | null = null;
	let serverAddress: string | null = null;
	let serverDisplayName = "Current game server";
	let playerState: LoadState = "idle";
	let selectedProfileId: number | null = null;
	let profileOverviewRequestId = 0
	let selectedOwner: ProfileOwner | null = null;
	let requestedTeamView: TeamPanelTarget | null = null
	let teamLocation: TeamPanelLocation = { teamId: null, teamView: `members` }
	let teamRequestCount = -1
	let requestedTeamId: number | null = null;
	let requestedTeamRequestId: number | null = null;
	let requestedYoursRequestId: number | null = null;
	let requestedServer: { id: number; requestId: number } | null = null;
	let serverNavigationSequence = 0;
	let warmedUserId: number | null = null;
	let processingPlayerLink = false;
	let rerunPlayerLinks = false;
	let linkUserId: number | null = null;
	let cancelCacheWarmup: () => void = () => {};
	const teamNavigation = createTeamNavigationHandoff((request) => {
		requestedTeamView = request?.teamView ?? null;
		requestedTeamId = request?.teamId ?? null;
		requestedTeamRequestId = request?.requestId ?? null;
	});
	const notificationNavigationIntent = createNotificationNavigationIntent();
	const resetNotificationNavigation = createNotificationNavigationReset(
		notificationNavigationIntent,
		teamNavigation.reset,
	);
	const notificationNavigationLifecycle = createNotificationNavigationLifecycle(
		resetNotificationNavigation,
		() => {
			selectedPlayer = null;
			selectedPlayerSubpage = null;
			notificationEvents.clear();
		},
	);
	const notificationInboxSession = createNotificationInboxSession(
		async () =>
			createNotificationInbox(
				getServerApi(),
				await getOverlayApi().notificationPollMs(),
				(notification, context) =>
					presentNotificationArrival(notification, {
						isCurrent: context.isCurrent,
						notify,
						setRead: notificationInboxSession.setRead,
						open: openNotification,
					}),
			),
		(error) =>
			notifyError(
				error instanceof Error ?
					error.message
				:	`Notification inbox failed to start.`,
				{ dedupeKey: `notifications:start` },
			),
		notificationNavigationLifecycle.reset,
	);
	const deletedNotificationInboxSession = createNotificationInboxSession(
		async () => createNotificationInbox(getServerApi(), 0, () => {}, `deleted`),
		(error) =>
			notifyError(
				error instanceof Error ?
					error.message
				:	`Deleted notifications failed to load.`,
			),
	);

	function refreshNotifications(
		visibility: NotificationVisibility,
	): Promise<void> {
		return (
			visibility === `deleted` ?
				deletedNotificationInboxSession
			:	notificationInboxSession).reload();
	}

	function loadMoreNotifications(
		visibility: NotificationVisibility,
	): Promise<void> {
		return (
			visibility === `deleted` ?
				deletedNotificationInboxSession
			:	notificationInboxSession).loadMore();
	}

	async function restoreNotification(id: number): Promise<void> {
		const userId = appUserId;
		await deletedNotificationInboxSession.restore(id);
		if (userId === appUserId) await notificationInboxSession.reload();
	}

	async function decideInvitation(
		notification: NotificationRecord,
		decision: TeamInvitationDecision,
	): Promise<void> {
		const invitation = notification.teamInvitation;
		if (!invitation) return;
		const userId = appUserId;
		const result = await unwrap<NotificationMutation>(
			await getServerApi().teams.decideInvitation(
				invitation.teamId,
				invitation.id,
				decision,
			),
			`Invitation response failed.`,
		);
		if (userId !== appUserId) return;
		await notificationInboxSession.reload();
		if (
			result.notification.teamInvitation?.status === `accepted` &&
			userId === appUserId
		) {
			const owners = await fetchProfileOwners();
			if (userId === appUserId) User.Ability.setOwners(owners);
			if (userId === appUserId) await currentTeamState.refresh()
		}
	}

	rememberNavigation(
		`app`,
		() => ({
			activePage,
			selectedPlayer,
			selectedPlayerSubpage,
			selectedOwner,
			selectedProfileId,
			showEvidence,
			uploadPlayer,
			uploadRequestId,
		}),
		(state) => {
			resetNotificationNavigation();
			requestedYoursRequestId = null;
			requestedServer = null;
			activePage =
				(
					[`requests`, `analysis`].includes(String(state.activePage)) ||
					(state.activePage === `admin` && !$authState.user?.isSuperadmin) ||
					(state.activePage === `content` && !canOpenContent($authState.user))
				) ?
					`dashboard`
				:	state.activePage
			selectedPlayer = state.selectedPlayer;
			selectedPlayerSubpage = state.selectedPlayerSubpage;
			selectedOwner = state.selectedOwner;
			selectedProfileId = state.selectedProfileId;
			showEvidence = state.showEvidence;
			uploadPlayer = state.uploadPlayer;
			uploadRequestId = state.uploadRequestId;
		},
		(state) => [
			state.activePage,
			state.selectedPlayer?.playfabId,
			state.selectedPlayerSubpage,
			state.selectedOwner,
			state.selectedProfileId,
			state.showEvidence,
			state.uploadRequestId,
		],
	);
	let navigationSessionUserId: number | null = null
	$: if (navigationSessionUserId !== appUserId) {
		navigationSessionUserId = appUserId
		navigation.reset();
	}

	$: if ($authState.user && !selectedOwner) {
		selectedOwner = { type: "user", id: $authState.user.id };
	}

	$: scheduleReveal(overlayVisible);
	$: profileRequired = needsPlayfabId($authState.user)
	$: if (profileRequired && (activePage !== `account` || selectedPlayer)) applyPage(`account`)
	$: appUserId = $authState.user?.isActive && $authState.user.onboardingComplete && !profileRequired
		? $authState.user.id : null
	$: sidebarVisible = operational && Boolean($authState.user?.isActive) && ![`starting`, `restoring-session`].includes($startupState.phase) && consoleSetupView === `existing` && !previewConsoleSetup
	$: operational = maintenanceOperational($maintenanceSession)
	$: operationalUserId = operational ? appUserId : null
  $: consoleSetupView = resolveSetupView({ authenticated: appUserId !== null, profileRequired, operational,
    setupLoaded: $consoleSetup.setupLoaded, setupRequired: $consoleSetup.setupRequired, settingsOpen: activePage === `settings` && selectedPlayer === null,
    modalOpen: $consoleSetupModalOpen && !$consoleSetupPreview })
  $: navigationUserId = consoleSetupView === `existing` ? operationalUserId : null
	$: maintenanceAdmin = canUseMaintenanceAdmin($authState.user)
	$: if (!maintenanceAdmin || operational) maintenanceAdminOpen.set(false)
	$: if (wasOperational !== operational) {
		wasOperational = operational;
		if (!operational) {
			resetNotificationNavigation();
			linkedEvidence = null;
			if (activePage === `admin` && maintenanceAdmin)
				maintenanceAdminOpen.set(true);
		}
	}
	$: if (navigationUserId !== linkUserId) {
		linkUserId = navigationUserId
		if (navigationUserId !== null && typeof window !== `undefined`) void processPlayerLink()
	}
	$: void notificationInboxSession.sync(operationalUserId);
	$: void deletedNotificationInboxSession.sync(operationalUserId);
	$: pendingTeamRequests.syncUser(operationalUserId);
	$: currentTeamState.syncUser(operationalUserId)
	$: if (operationalUserId === null) teamRequestCount = -1
	$: if (operationalUserId !== null && teamRequestCount !== $pendingTeamRequests) {
		teamRequestCount = $pendingTeamRequests
		void currentTeamState.refresh()
	}
	$: currentTeamState.observeServer({
		connectionKey: $currentServer.snapshot ? `${$currentServer.snapshot.gameServerId}:${$currentServer.snapshot.externalId}` : null,
		ownerTeamId: $currentServer.activeProfile?.gameServer?.externalId === $currentServer.snapshot?.externalId ? $currentServer.activeProfile?.ownerTeamId ?? null : null,
		ownershipResolved: $currentServer.activeProfile !== null
	})
	$: consoleSetup.sync(operationalUserId !== null);
  $: previewConsoleSetup = $consoleSetupPreview && $authState.user?.isSuperadmin === true
  $: if (!$authState.user?.isSuperadmin) consoleSetup.closePreview()
	$: currentServer.sync(
		$startupState.phase === `authenticated` ? operationalUserId : null,
		`${$gameServerRevision}:${$profilePreferencesState.userId}:${$profilePreferencesState.revision}`,
	);
	$: updateServerSummary($currentServerSummary);
	$: if ($consoleSetup.commandsBlocked) closeInfinityMenu();
	$: syncGameProcessAvailability(
		$startupState.phase === "authenticated" && operationalUserId !== null,
	);
	$: if (operationalUserId !== warmedUserId) {
		cancelCacheWarmup();
		warmedUserId = operationalUserId;
		if (warmedUserId !== null && typeof window !== "undefined") {
			cancelCacheWarmup = schedulePanelPreload(window, () =>
				warmAuthenticatedCaches(getServerApi()),
			);
		}
	}

	onMount(() => {
		let unsubscribeOverlayVisibility: (() => void) | undefined;
		const stopInputFocus = observeOverlayInputFocus(document, focused => {
			try {
				getOverlayApi().setTextInputActive(focused)
			} catch {
				// Browser-only development has no Electron preload bridge.
			}
		})
		const unsubscribeAuth = listenForSessionChanges();
		const stopAppLinks = window.chivOverlay?.onAppLinkChanged?.(() => {
			void processPlayerLink();
		});
		void processPlayerLink();


		void loadSettings();
		void loadSession();
		void initializeOverlayVisibility((unsubscribe) => {
			unsubscribeOverlayVisibility = unsubscribe;
		});

		const unsubscribeSnapshotLookup = listenForSnapshotLookups();
		const stopHistory = window.chivOverlay?.onHistoryNavigate?.(direction => {
			if (direction === `back` && operational && consoleSetupView === `existing` && !previewConsoleSetup) navigateBack()
		})
		const stopEvidenceNavigation = evidenceNavigationRequest.subscribe(request => {
			if (request) void openEvidenceDestination(request)
		})

		return () => {
			stopInputFocus()
			unsubscribeOverlayVisibility?.();
			unsubscribeSnapshotLookup?.();
			stopHistory?.();
			unsubscribeAuth();
			stopAppLinks?.();
			stopEvidenceNavigation();
		};
	});

	onDestroy(() => {
		clearRevealTimer();
		cancelCacheWarmup();
		notificationInboxSession.stop();
		deletedNotificationInboxSession.stop();
		stopGameProcessAvailability();
		currentServer.sync(null);
		pendingTeamRequests.syncUser(null);
		currentTeamState.syncUser(null)
		consoleSetup.sync(false);
	});

	function listenForSnapshotLookups(): (() => void) | undefined {
		try {
			return new SnapshotLookupController({
				api: getOverlayApi(),
				resolvePlayer: async match => {
					if (get(currentServer).snapshot?.gameServerId !== match.gameServerId) return null
					await currentServer.refreshRoster(true)
					return get(currentServer).snapshot?.gameServerId === match.gameServerId
						? get(currentServer).players.find(player => player.isOnline && player.playfabId === match.playfabId) ?? null : null
				},
				context: () => {
					const server = get(currentServer)
					return { user: $authState.user, connectionGeneration: currentServer.connectionGeneration,
						gameServerId: server.snapshot?.gameServerId, players: server.players,
						available: operational && consoleSetupView === `existing` }
				},
				onMatch: showPlayer,
				play: cue => SFX.play(cue),
				record: recordPlayerDetection
			}).listen()
		} catch {
			return undefined;
		}
	}

	async function showPlayer(player: PlayerState, isCurrent: () => boolean = () => true): Promise<boolean> {
		if (!operational || consoleSetupView !== `existing` || !isCurrent()) return false
		return visitSnapshotPlayer(navigation, async (subpage) => {
			if (profileRequired || !isCurrent()) return false
			if (!operational || !(await unsavedChanges.canLeave()) || !operational || !isCurrent()) return false
			if (selectedPlayerSubpage === subpage) {
				selectedPlayerSubpage = null
				await tick()
				if (!operational || !isCurrent()) return false
			}
			resetNotificationNavigation();
			activePage = "server";
			selectedProfileId = null;
			selectedPlayer = player;
			selectedPlayerSubpage = subpage;
			showEvidence = false;
			return true
		});
	}

	async function selectPage(page: ActivePage): Promise<boolean> {
    if (consoleSetupView !== `existing`) return false
		if (!operational && (page !== `admin` || !maintenanceAdmin)) return false
		return navigation.visit(async () => {
			if (profileRequired && page !== `account`) return false;
			if (page !== activePage && !(await unsavedChanges.canLeave()))
				return false;
			resetNotificationNavigation();
			return applyPage(page);
		});
	}

	async function openYourServers(): Promise<void> {
		await navigation.visit(async () => {
			if (profileRequired || !(await unsavedChanges.canLeave())) return;
			resetNotificationNavigation();
			if (!applyPage(`servers`)) return;
			requestedYoursRequestId = ++serverNavigationSequence;
		});
	}

	async function openServer(serverId: number): Promise<void> {
		await navigation.visit(async () => {
			if (profileRequired || !(await unsavedChanges.canLeave())) return;
			resetNotificationNavigation();
			if (!applyPage(`servers`)) return;
			requestedServer = { id: serverId, requestId: ++serverNavigationSequence };
		});
	}

	async function openTeam(teamId: number, view?: `settings`): Promise<void> {
		await openTeamDestination({ page: `teams`, teamId, teamView: view ?? `members` })
	}

	async function openTeamDestination(target: TeamNavigationTarget): Promise<boolean> {
		const user = $authState.user
		try {
			return await visitTeamTarget(target, {
				isCurrent: () => operational && !profileRequired && user !== null && user === $authState.user,
				canLeave: () => unsavedChanges.canLeave(),
				visit: action => navigation.visit(action),
				open: async destination => {
					resetNotificationNavigation()
					if (!applyPage(destination.page)) return false
					if (destination.page === `profiles`) {
						selectedOwner = { type: `team`, id: destination.teamId }
						selectedProfileId = null
						profileOverviewRequestId++
						return true
					}
					return teamNavigation.request(destination.teamId, destination.teamView)
				}
			})
		} catch (error) {
			if (user === $authState.user) notifyError(error instanceof Error ? error.message : `Team could not be opened.`)
			return false
		}
	}

	function handleYoursRequest(requestId: number): void {
		if (requestedYoursRequestId === requestId) requestedYoursRequestId = null;
	}

	function handleServerRequest(requestId: number): void {
		if (requestedServer?.requestId === requestId) requestedServer = null;
	}

	function applyPage(page: ActivePage): boolean {
    if (consoleSetupView !== `existing`) return false
		if (!operational && (page !== `admin` || !maintenanceAdmin)) return false
		if (page === `admin` && !$authState.user?.isSuperadmin) return false
		if (page === `content` && !canOpenContent($authState.user)) return false
		if (page !== `servers`) requestedYoursRequestId = null
		if (page !== `servers`) requestedServer = null
		activePage = page;
		selectedPlayer = null;
		selectedPlayerSubpage = null;
		showEvidence = false;
		uploadPlayer = null;
		uploadRequestId = 0;
		openEvidenceId = null;
		openCandidateId = null;
		openCandidateEvidenceId = null;
		if (page !== "profiles") selectedProfileId = null;
		return true;
	}
	$: if (activePage === `content` && !canOpenContent($authState.user)) activePage = `dashboard`

	async function openNotification(
		notification: NotificationRecord,
	): Promise<void> {
		if (!operational) return;
		if (await cancelNotificationRequest(notification)) return;
		await navigation.visit(async () => {
			if (!(await unsavedChanges.canLeave())) return;
			const uri = notification.callback?.uri ?? "";
			resetNotificationNavigation();
			await openNotificationTarget(uri, {
				selectPage: applyPage,
				selectTeam: teamNavigation.request,
				openWantedPlayer: async (playfabId) => {
					await notificationNavigationIntent.run(
						() => fetchPlayerProfile(playfabId),
						(profile) => {
							selectedPlayer = createDbPlayerState(profile.player);
						},
					);
				},
				openPlayerNotes: async (playfabId) => {
					await notificationNavigationIntent.run(
						() => fetchPlayerProfile(playfabId),
						(profile) => {
							selectedPlayer = createDbPlayerState(profile.player);
							selectedPlayerSubpage = "notes";
						},
					);
				},
				invalid: () => {
					notifyError("Notification target could not be opened.", {
						dedupeKey: `notification:${notification.id}:callback`,
					});
				},
			});
		});
	}

	async function openProfile(
		profileId: number,
		owner?: ProfileOwner,
	): Promise<void> {
		if (!operational) return;
		await navigation.visit(async () => {
			if (!(await unsavedChanges.canLeave())) return;
			resetNotificationNavigation();
			if (owner) selectedOwner = owner;
			activePage = "profiles";
			selectedPlayer = null;
			selectedPlayerSubpage = null;
			selectedProfileId = profileId;
		});
	}

	function selectPlayer(player: PlayerState | null): void {
		if (!operational) return;
		void navigation.visit(() => {
			resetNotificationNavigation();
			selectedPlayer = player;
			selectedPlayerSubpage = null;
			openEvidenceId = null;
			showEvidence = false;
		});
	}

	async function openPlayerProfile(player: PlayerState): Promise<void> {
		if (!operational) return;
		await navigation.visit(async () => {
			if (!operational || !(await unsavedChanges.canLeave()) || !operational)
				return;
			resetNotificationNavigation();
			activePage = "players";
			selectedPlayer = player;
			selectedPlayerSubpage = null;
			openEvidenceId = null;
			showEvidence = false;
		});
	}

	async function openWantedProfile(player: PlayerState): Promise<void> {
		if (!operational) return;
		await navigation.visit(async () => {
			if (!operational || !(await unsavedChanges.canLeave()) || !operational)
				return;
			resetNotificationNavigation();
			activePage = `wanted`;
			selectedPlayer = player;
			selectedPlayerSubpage = null;
			openEvidenceId = null;
			showEvidence = false;
		});
	}

	async function openEvidenceDestination(
		request: EvidenceNavigationRequest,
	): Promise<void> {
		const user = $authState.user;
		const current = () =>
			operational &&
			user === $authState.user &&
			get(evidenceNavigationRequest)?.sequence === request.sequence;
		try {
			if (!operational || !user || profileRequired || consoleSetupView !== `existing`) return
			const selected = request.action === `add` || request.player.id !== null
				? request.player : (await fetchPlayerProfile(request.player.playfabId)).player
			await navigation.visit(async () => {
				if (!current() || !(await unsavedChanges.canLeave()) || !current())
					return false;
				resetNotificationNavigation();
				if (request.action === `add`) {
					applyPage(`wanted`);
					uploadPlayer = selected;
					uploadRequestId = request.sequence;
				} else if (request.candidateId) {
					applyPage(`wanted`);
					openCandidateId = request.candidateId;
				} else {
					applyPage(request.wanted ? `wanted` : `players`);
					selectedPlayer = createDbPlayerState({
						...selected,
						id: selected.id!,
					});
					showEvidence = request.action === `view`;
				}
				return true;
			});
		} catch (cause) {
			if (current())
				notifyError(
					cause instanceof Error ?
						cause.message
					:	`Player evidence could not be opened.`,
				);
		} finally {
			clearEvidenceNavigation(request.sequence);
		}
	}

	async function processPlayerLink(): Promise<void> {
		if (!operational) return;
		if (processingPlayerLink) {
			rerunPlayerLinks = true;
			return;
		}
		const overlay = window.chivOverlay
		if (navigationUserId === null || !overlay?.pendingAppLink) return
		processingPlayerLink = true
		try {
			while (operational && navigationUserId !== null) {
				rerunPlayerLinks = false
				const link = await overlay.pendingAppLink()
				if (!link) break
				if (link.kind === `evidence`) {
					try {
						const item = await getLinkedEvidence(link.token ?? ``);
						const reviewer =
							item.candidateId !== null &&
							(await getWantedCandidate(item.candidateId).then(
								() => true,
								() => false,
							));
						const profile =
							item.isWanted ? await fetchPlayerProfile(item.playfabId) : null;
						await navigation.visit(async () => {
							if (!operational || navigationUserId === null || !(await unsavedChanges.canLeave()) || navigationUserId === null || (await overlay.pendingAppLink())?.sequence !== link.sequence) return false
							resetNotificationNavigation()
							if (profile) {
								activePage = `wanted`;
								selectedPlayer = createDbPlayerState(profile.player);
								selectedPlayerSubpage = null;
								openEvidenceId = item.id;
							} else if (reviewer && item.candidateId !== null) {
								activePage = `wanted`
								selectedPlayer = null
								openCandidateId = item.candidateId
								openCandidateEvidenceId = item.id
							} else linkedEvidence = item
							return true
						})
					} catch { notifyError(`Evidence link could not be opened.`, { dedupeKey: `evidence-link:${link.sequence}` }) }
					if (navigationUserId !== null && (await overlay.pendingAppLink())?.sequence === link.sequence) await overlay.acknowledgeAppLink(link.sequence)
					continue
				}
				await openPendingPlayerLink(link, {
					ready: () => operational && navigationUserId !== null,
					current: () => overlay.pendingAppLink(),
					fetch: playfabId => fetchPlayerProfile(playfabId),
					profileId: profile => profile.player.playfabId,
					navigate: (profile, sequence) => visitPlayerLink(profile, sequence, {
						ready: () => operational && navigationUserId !== null,
						current: () => overlay.pendingAppLink(),
						canLeave: () => unsavedChanges.canLeave(),
						visit: action => navigation.visit(action),
						open: target => {
							resetNotificationNavigation()
							applyPage(link.kind === `wanted` ? `wanted` : `players`)
							selectedPlayer = createDbPlayerState(target.player)
							openEvidenceId = null
						}
					}),
					acknowledge: sequence => overlay.acknowledgeAppLink(sequence),
					invalid: message => notifyError(message, { dedupeKey: `player-link:${link.sequence}` })
				})
				if ((await overlay.pendingAppLink())?.sequence === link.sequence) break
			}
		} catch {
			notifyError(`Player link could not be opened.`, {
				dedupeKey: `player-link:delivery`,
			});
		} finally {
			processingPlayerLink = false;
			if (rerunPlayerLinks && operational && appUserId !== null)
				void processPlayerLink();
		}
	}

	async function openPlayerNotes(player: PlayerState): Promise<void> {
		if (!operational) return;
		await navigation.visit(async () => {
			if (!operational || !(await unsavedChanges.canLeave()) || !operational)
				return;
			resetNotificationNavigation();
			const target = playerNotesNavigationTarget(player);
			activePage = target.page;
			selectedPlayer = target.player;
			selectedPlayerSubpage = target.subpage;
			showEvidence = false;
		});
	}

	function selectProfile(profileId: number | null): void {
		if (!operational) return;
		void navigation.visit(() => {
			resetNotificationNavigation();
			selectedProfileId = profileId;
		});
	}

	function selectOwner(owner: ProfileOwner): void {
		if (!operational) return;
		void navigation.visit(() => {
			resetNotificationNavigation();
			selectedOwner = owner;
		});
	}

	async function initializeOverlayVisibility(
		setUnsubscribe: (unsubscribe: () => void) => void,
	): Promise<void> {
		try {
			const overlayApi = getOverlayApi();
			setOverlayVisibility(await overlayApi.isVisible());
			setUnsubscribe(overlayApi.onVisibilityChange(setOverlayVisibility));
		} catch {
			setOverlayVisibility(document.visibilityState === "visible");
		}
	}

	function setOverlayVisibility(visible: boolean): void {
		overlayVisible = visible;
		syncOverlayVisibilitySfx(visible);
	}

	async function hideOverlay(): Promise<void> {
		try {
			await getOverlayApi().hide();
		} catch {
			setOverlayVisibility(false);
		}
	}


	async function signOut(): Promise<void> {
		if (await unsavedChanges.canLeave())
			await notificationNavigationLifecycle.leave(logout);
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

	function openMaintenanceAdmin(): void {
		if (!maintenanceAdmin) return;
		applyPage(`admin`);
		maintenanceAdminOpen.set(true);
	}
</script>

<AppUpdatePanel showFallbackNotice={!sidebarVisible} />

{#if !operational && !$maintenanceAdminOpen && !(maintenanceSignIn && !$authState.user)}
	<MaintenanceSurface
		state={$maintenanceSession}
		signedIn={$authState.user !== null}
		canAdmin={maintenanceAdmin}
		onAdmin={openMaintenanceAdmin}
		onSignIn={() => (maintenanceSignIn = true)}
		onSignOut={() => void signOut()}
		onClose={() => void hideOverlay()}
		onRefresh={() => getServerApi().maintenance.refresh()}
	/>
{:else if $startupState.phase === "starting" || $startupState.phase === "restoring-session"}
	<StartupOverlay />
{:else if !$authState.user || !$authState.user.isActive}
	<AuthScreen
		user={$authState.user}
		startupError={$startupState.error}
		startupErrorCode={$startupState.errorCode}
		onClose={() => void hideOverlay()}
	/>
{:else if consoleSetupView !== `existing`}
  <main class="overlay-shell overlay-shell--visible console-setup-shell">
    <OverlayBackdrop onHide={() => void hideOverlay()} />
    {#if consoleSetupView === `consoleSetup`}
      <ConsoleSetupGate preview={previewConsoleSetup} onReturn={previewConsoleSetup ? consoleSetup.closePreview : null} onHide={() => void hideOverlay()} onSignOut={() => void signOut()} />
    {:else}
      <section class="console-setup-loading" aria-live="polite">
        <h1>Loading console setup…</h1>
        <p>{$consoleSetup.enabled.status === `unavailable` ? $consoleSetup.enabled.message : `Checking the saved key and Windows keyboard layouts.`}</p>
        <button type="button" on:click={() => void consoleSetup.refresh()}>Retry</button>
        <button type="button" on:click={() => void hideOverlay()}>Hide SpellBook</button>
        <button type="button" on:click={() => void signOut()}>Sign out</button>
      </section>
    {/if}
  </main>
{:else}
  {#if previewConsoleSetup}
    <main class="overlay-shell overlay-shell--visible console-setup-shell">
      <OverlayBackdrop onHide={() => void hideOverlay()} />
      <ConsoleSetupGate preview onReturn={consoleSetup.closePreview} onHide={() => void hideOverlay()} onSignOut={() => void signOut()} />
    </main>
  {/if}
	<main
		class="overlay-shell overlay-shell--menuBar"
		class:overlay-shell--preview-hidden={previewConsoleSetup}
		class:overlay-shell--visible={frameReady}
		class:overlay-shell--dashboard={activePage === "dashboard"}
		class:overlay-shell--servers={activePage === "servers"}
		class:overlay-shell--teams={activePage === "teams"}
		class:overlay-shell--maintenance={!operational}
	>
    <OverlayBackdrop onHide={() => void hideOverlay()} />

		{#if operational}<MenuBar
				{activePage}
				currentTeam={$currentTeam}
				teamState={$currentTeamState}
				{teamLocation}
				contentTeamId={getTeamContentId(activePage, selectedOwner, teamLocation, requestedTeamRequestId === null ? null : { teamId: requestedTeamId })}
				{selectedOwner}
				onSelectTeam={teamId => currentTeamState.select(teamId)}
				onHideOverlay={hideOverlay}
				onRefreshTeams={() => currentTeamState.refresh()}
				onTeamDestination={openTeamDestination}
				{serverDisplayName}
				notificationCount={$notificationInboxSession.unreadCount}
				user={$authState.user}
				onSelectPage={page => page === `teams` ? openTeamDestination({ page: `teams`, teamId: null }) : selectPage(page)}
				onLogout={signOut}
			/>{:else}<aside class="maintenance-admin-notice">
				<strong>{$maintenanceSession.maintenance?.title}</strong>
				<p>{$maintenanceSession.maintenance?.text}</p>
				<button type="button" on:click={() => maintenanceAdminOpen.set(false)}
					>Back to maintenance notice</button
				><button type="button" on:click={() => void signOut()}>Sign out</button>
			</aside>{/if}

		<AmbientStage />
		{#if operational}<ConsoleIssueStatus
				onOpenSettings={() => void selectPage(`settings`)}
			/>{/if}

		{#if operational && !profileRequired}
			<QuickActions
				user={$authState.user}
				{serverExternalId}
				{serverName}
			/>
		{/if}

		<OverlayContent
			{operational}
			onOpenSettings={() => void selectPage(`settings`)}
			{activePage}
			{selectedPlayer}
			{selectedPlayerSubpage}
			{openEvidenceId}
			{openCandidateId}
			{openCandidateEvidenceId}
			{linkedEvidence}
			{showEvidence}
			{uploadPlayer}
			{uploadRequestId}
			onClearUploadRequest={() => {
				uploadPlayer = null;
				uploadRequestId = 0;
			}}
			onOpenCandidateHandled={() => (openCandidateId = null)}
			onCloseLinkedEvidence={() => (linkedEvidence = null)}
			{selectedOwner}
			{selectedProfileId}
			{profileOverviewRequestId}
			{overlayVisible}
			{serverExternalId}
			{serverName}
			{serverAddress}
			{requestedTeamView}
			onTeamLocation={location => teamLocation = location}
			{requestedTeamId}
			{requestedTeamRequestId}
			{requestedYoursRequestId}
			{requestedServer}
			notificationState={$notificationInboxSession}
			deletedNotificationState={$deletedNotificationInboxSession}
			onRestoreNotification={restoreNotification}
			onDecideInvitation={decideInvitation}
			onRefreshNotifications={refreshNotifications}
			onLoadMoreNotifications={loadMoreNotifications}
			onSetNotificationRead={notificationInboxSession.setRead}
			onMarkAllNotificationsRead={notificationInboxSession.markAllRead}
			onRemoveNotification={notificationInboxSession.remove}
			onRemoveAllNotifications={notificationInboxSession.removeAll}
			onOpenNotification={openNotification}
			onRequestedTeamHandled={teamNavigation.handled}
			onOpenYourServers={openYourServers}
			onOpenTeams={() => void openTeamDestination({ page: `teams`, teamId: null })}
			onOpenTeam={openTeam}
			onRequestedYoursHandled={handleYoursRequest}
			onRequestedServerHandled={handleServerRequest}
			onOpenServer={(serverId) => void openServer(serverId)}
			onSelectPlayer={(player) => selectPlayer(player)}
			onOpenPlayerProfile={openPlayerProfile}
			onOpenWanted={openWantedProfile}
			onOpenPlayerNotes={openPlayerNotes}
			onClearSelectedPlayer={() => selectPlayer(null)}
			onOpenProfile={openProfile}
			onSelectProfile={selectProfile}
			onSelectOwner={selectOwner}
		/>
	</main>
{/if}

<style lang="scss">
  .console-setup-shell { grid-template-columns: minmax(0, 1fr); align-items: center; }
  .overlay-shell--preview-hidden { display: none; }
  .console-setup-loading { position: relative; margin: auto; padding: var(--gutter-lg); background: var(--color-dark-primary); border-radius: var(--radius-xl); }
	.maintenance-admin-notice { position: relative; z-index: 2; padding: var(--gutter-lg); min-width: 0; overflow: auto; }
	.maintenance-admin-notice p { white-space: pre-wrap; overflow-wrap: anywhere; }
	.maintenance-admin-notice button { display: block; margin-top: var(--gutter-md); }
</style>
