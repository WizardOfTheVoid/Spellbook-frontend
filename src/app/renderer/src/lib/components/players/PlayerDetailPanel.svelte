<script lang="ts">
	import {
		navigation,
		rememberNavigation,
		navigationScroll,
	} from "$lib/navigation/navigation";
	import { onDestroy, onMount } from "svelte";
	import PlayerPresenceName from "./PlayerPresenceName.svelte";
	import type {
		ActiveServerProfile,
		PlayerAction,
		PlayerDbProfile,
		PlayerNoteUserReference,
		ServerProfileAction,
	} from "$lib/core";
	import { authState } from "$lib/auth/user";
	import type { PlayerState } from "$lib/types/playerState";
	import { refreshPlayerProfile } from "$lib/utils/serverProfilesApi";
	import { executeProfileAction } from "$lib/utils/profileCommandRunner";
	import { profileExecutionGuard } from "$lib/utils/profileExecutionGuard";
	import { getPlayerDisplayName } from "$lib/utils/displayNames";
	import {
		loadPlayerProfileActionContext,
		loadPlayerProfileSnapshot,
	} from "$lib/utils/playerProfileLoader";
	import { mergePlayerState } from "$lib/utils/playerStateData";
	import {
		buildCurrentGameItems,
		buildMetaItems,
		buildNicknameItems,
	} from "$lib/utils/playerDetailItems";
	import {
		notifyError,
		notifySuccess,
		notifyWarning,
	} from "$lib/notifications/notificationEvents";
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte";
	import Tag from "$lib/components/ui/Tag.svelte";
	import Tabs from "$lib/components/ui/tabs.svelte";
	import Wip from "$lib/components/ui/wip.svelte";
	import InfoNotice from "$lib/components/ui/infoNotice.svelte"
	import TileGrid from "$lib/components/ui/TileGrid.svelte";
	import PlayerTileSection from "./PlayerTileSection.svelte";
	import PlayerActionDetail from "./PlayerActionDetail.svelte";
	import PlayerNotes from "./PlayerNotes.svelte";
	import PlayerNoteUserDetail from "./PlayerNoteUserDetail.svelte";
	import PlayerActionsSection from "./PlayerActionsSection.svelte";
	import ProfileActionList from "./ProfileActionList.svelte";
	import { activeProfileGraphs } from "$lib/utils/activeProfiles";
	import { profilePreferencesState } from "$lib/stores/profilePreferencesStore";
	import { openOffenseRemoval } from "./offenses/offenseRemovalState";
	import { loadOffenses, runOffenseAction } from "./offenses/offenseActions";
	import { isActionBanActive } from "$lib/utils/playerActions";
	import { playerStatusNow } from "$lib/stores/playerStatusClock";
	import Button from "$lib/components/ui/Button.svelte";
	import ActionRow from "$lib/components/ui/ActionRow.svelte";
	import { playerDetailBackTarget } from "./playerDetailNavigation";
	import { gameProcessAvailable } from "$lib/stores/gameProcessAvailabilityStore";
	import {
		GAME_PROCESS_REQUIRED_TOOLTIP,
		profileActionRequiresGameProcess,
	} from "$lib/utils/gameProcessActions";

	export let player: PlayerState;
	export let serverExternalId: string | null = null;
	export let serverName = "Current game server";
	export let serverAddress: string | null = null;
	export let backLabel: string;
	export let onBack: () => void;
	export let notice: string | null = null;
	export let initialSubpage: "notes" | null = null;
	export let showCurrentGame = true;

	const PLAYER_STATE_REFRESH_MS = 5000;

	let currentPlayer: PlayerState = player;
	let currentServerExternalId = serverExternalId;
	let currentServerName = serverName;
	let currentServerAddress = serverAddress;
	let appliedServerName = serverName;
	let appliedServerExternalId = serverExternalId;
	let appliedServerAddress = serverAddress;
	let dbProfile: PlayerDbProfile | null = null;
	let profileViewer = $authState.user;
	let visitAttempted = false;
	let profileSession = 0;
	let destroyed = false;
	let profileLoading = false;
	let playFabLoading = false;
	let playFabRefreshAttemptedId = "";
	let lastProfileError = "";
	let isRefreshingPlayerState = false;
	let pendingPlayerStateRefresh = false;
	let pendingPlayerStateRefreshLoading = false;
	let infoTab = `info`;
	let actionMode = false;
	let actionLoading = false;
	let activeProfile: ActiveServerProfile | null = null;
	let actionRequest = 0;
	let actionPreferenceKey = ``;
	let runningAction: ServerProfileAction | null = null;
	let loadedPlayfabId = "";
	let selectedAction: PlayerAction | null = null;
	let selectedUser: PlayerNoteUserReference | null = null;
	let addingNote = false;
	let seedActionId: number | null = null;
	let notesMode = initialSubpage === "notes";
	let appliedSubpage = initialSubpage;
	$: if (initialSubpage !== appliedSubpage) {
		appliedSubpage = initialSubpage;
		notesMode = initialSubpage === `notes`;
		infoTab = `info`;
		selectedAction = null;
		selectedUser = null;
		actionMode = false;
		addingNote = false;
	}

	$: if (player.playfabId !== loadedPlayfabId) {
		visitAttempted = false;
		loadedPlayfabId = player.playfabId;
		currentPlayer = player;
		dbProfile = null;
		playFabLoading = false;
		playFabRefreshAttemptedId = "";
		actionMode = false;
		activeProfile = null;
		selectedAction = null;
		selectedUser = null;
		addingNote = false;
		seedActionId = null;
		notesMode = initialSubpage === "notes";
		infoTab = `info`;
		void loadPlayerState();
	}

	$: if ($authState.user !== profileViewer) {
		profileViewer = $authState.user;
		profileSession += 1;
		dbProfile = null;
		playFabRefreshAttemptedId = ``;
		playFabLoading = false;
		if (profileViewer) void loadPlayerState();
	}

	onDestroy(() => {
		destroyed = true;
	});

	$: if (serverName !== appliedServerName) {
		appliedServerName = serverName;
		currentServerName = serverName;
	}

	$: if (serverExternalId !== appliedServerExternalId) {
		appliedServerExternalId = serverExternalId;
		currentServerExternalId = serverExternalId;
	}

	$: if (serverAddress !== appliedServerAddress) {
		appliedServerAddress = serverAddress;
		currentServerAddress = serverAddress;
	}

	onMount(() => {
		const refreshTimer = window.setInterval(() => {
			if (!runningAction && !playFabLoading) void loadPlayerState(false);
		}, PLAYER_STATE_REFRESH_MS);

		return () => {
			actionRequest += 1;
			window.clearInterval(refreshTimer);
		};
	});

	$: activeTab =
		actionMode ? `actions`
		: notesMode ? `notes`
		: infoTab;
	$: playerActions = dbProfile?.actions ?? [];
	$: noteCount = dbProfile?.noteCount ?? 0;
	$: banActions = playerActions.filter((action) => action.actionType === "ban");
	$: nicknames = (dbProfile?.names ?? []).map((name) => name.name);
	$: currentGameItems = buildCurrentGameItems(currentPlayer);
	$: metaItems = buildMetaItems(
		dbProfile,
		playerActions,
		banActions,
		nicknames,
		playFabLoading,
	);
	$: nicknameItems = buildNicknameItems(dbProfile?.names ?? []);
	$: actionProfiles = activeProfileGraphs(activeProfile);
	$: {
		const key = `${currentServerExternalId ?? ``}:${$profilePreferencesState.userId}:${$profilePreferencesState.revision}`;
		if (key !== actionPreferenceKey) {
			actionPreferenceKey = key;
			activeProfile = null;
			if (actionMode) void loadActionContext();
		}
	}
	$: playerDisplayName = getPlayerDisplayName(currentPlayer.name);
	$: headerBackTarget = playerDetailBackTarget(
		actionMode,
		selectedAction !== null,
		selectedUser !== null,
		notesMode,
	);

	async function loadPlayerState(showLoading = true): Promise<void> {
		if (destroyed || !$authState.user) return;
		if (isRefreshingPlayerState) {
			pendingPlayerStateRefresh = true;
			pendingPlayerStateRefreshLoading ||= showLoading;
			return;
		}

		const playfabId = currentPlayer.playfabId;
		const session = profileSession;
		const visit = !visitAttempted;
		visitAttempted = true;
		isRefreshingPlayerState = true;
		if (showLoading) profileLoading = true;

		try {
			const snapshot = await loadPlayerProfileSnapshot(
				currentPlayer,
				{
					serverExternalId: currentServerExternalId,
					serverName: currentServerName,
					serverAddress: currentServerAddress,
				},
				visit,
			);
			if (
				destroyed ||
				session !== profileSession ||
				playfabId !== loadedPlayfabId
			)
				return;

			if (snapshot.serverName !== null) currentServerName = snapshot.serverName;
			currentServerExternalId = snapshot.serverExternalId;
			if (snapshot.serverAddress !== null) {
				currentServerAddress = snapshot.serverAddress;
			}

			dbProfile = snapshot.dbProfile;
			activeOffenseBans = [];
			if (dbProfile) {
				const options = await loadOffenses(dbProfile.player.id);
				if (
					destroyed ||
					session !== profileSession ||
					playfabId !== loadedPlayfabId
				)
					return;
				activeOffenseBans = options.activeBans;
			}

			if (snapshot.profileError) {
				if (snapshot.profileError !== lastProfileError) {
					notifyWarning(snapshot.profileError, {
						dedupeKey: `player-profile:${playfabId}`,
					});
					lastProfileError = snapshot.profileError;
				}
			} else {
				lastProfileError = "";
			}

			if (snapshot.player) currentPlayer = snapshot.player;

			if (
				snapshot.dbProfile?.player.playfab.freshness.stale &&
				playFabRefreshAttemptedId !== playfabId
			) {
				playFabRefreshAttemptedId = playfabId;
				void refreshStalePlayFab(playfabId);
			}
		} finally {
			profileLoading = false;
			isRefreshingPlayerState = false;

			if (pendingPlayerStateRefresh) {
				const pendingShowLoading = pendingPlayerStateRefreshLoading;
				pendingPlayerStateRefresh = false;
				pendingPlayerStateRefreshLoading = false;
				void loadPlayerState(pendingShowLoading);
			}
		}
	}

	async function refreshStalePlayFab(playfabId: string): Promise<void> {
		const session = profileSession;
		playFabLoading = true;

		try {
			const refreshed = await refreshPlayerProfile(playfabId);
			if (
				destroyed ||
				session !== profileSession ||
				playfabId !== loadedPlayfabId
			)
				return;

			dbProfile = refreshed;
			currentPlayer = mergePlayerState(
				currentPlayer.livePlayer,
				refreshed.player,
			);

			if (refreshed.player.playfab.freshness.refreshFailed) {
				notifyWarning("PlayFab refresh failed. Showing cached data.", {
					dedupeKey: `player-playfab:${playfabId}`,
				});
			}
		} catch (error) {
			if (
				!destroyed &&
				session === profileSession &&
				playfabId === loadedPlayfabId
			) {
				notifyWarning(
					error instanceof Error ?
						error.message
					:	"Player profile refresh failed.",
					{ dedupeKey: `player-playfab:${playfabId}` },
				);
			}
		} finally {
			if (session === profileSession && playfabId === loadedPlayfabId)
				playFabLoading = false;
		}
	}

	async function selectTab(value: string): Promise<void> {
		if (runningAction) return;
		await navigation.visit(async () => {
			selectedAction = null;
			selectedUser = null;
			addingNote = false;
			seedActionId = null;
			actionMode = value === `actions`;
			notesMode = value === `notes`;
			infoTab = actionMode || notesMode ? `info` : value;
			if (actionMode) await loadActionContext();
		});
	}

	async function loadActionContext(): Promise<void> {
		if (!$authState.user) {
			notifyError("Sign in before using profile actions.", {
				dedupeKey: "player-actions:no-user",
			});
			return;
		}

		const request = ++actionRequest;
		const externalId = currentServerExternalId;
		const playfabId = currentPlayer.playfabId;
		const session = profilePreferencesState.captureSession();
		const current = () =>
			request === actionRequest &&
			externalId === currentServerExternalId &&
			playfabId === currentPlayer.playfabId &&
			profilePreferencesState.isCurrent(session);
		actionLoading = true;

		try {
			const result = await loadPlayerProfileActionContext(externalId);
			if (current()) activeProfile = result;
		} catch (error) {
			if (!current()) return;
			notifyError(
				error instanceof Error ?
					error.message
				:	"Profile actions failed to load.",
				{ dedupeKey: "player-actions:load" },
			);
		} finally {
			if (current()) actionLoading = false;
		}
	}

	let activeOffenseBans: PlayerAction[] = [];

	function offenseTarget() {
		return {
			playerId: dbProfile?.player.id ?? currentPlayer.dbId!,
			playfabId: currentPlayer.playfabId,
			name: playerDisplayName,
			onComplete: async () => {
				selectedAction = null;
				await loadPlayerState();
			},
		};
	}

	async function runAction(action: ServerProfileAction): Promise<void> {
		if (!$authState.user || runningAction) return;
		if (action.commands.some((command) => command.commandType === `unban`)) {
			const profile = actionProfiles.find((graph) =>
				graph.actions.some((candidate) => candidate.id === action.id),
			)?.profile;
			if (profile && action.actionKey && activeProfile?.gameServer)
				openOffenseRemoval({
					...offenseTarget(),
					gameServerId: activeProfile.gameServer.id,
					profile: { profileId: profile.id, actionKey: action.actionKey },
				});
			return;
		}
		if (profileActionRequiresGameProcess(action) && !$gameProcessAvailable) {
			notifyWarning(GAME_PROCESS_REQUIRED_TOOLTIP);
			return;
		}
		runningAction = action;

		try {
			const result = await executeProfileAction(action, {
				player: currentPlayer,
				admin: $authState.user,
				serverName: currentServerName,
				gameServer: activeProfile?.gameServer ?? null,
				dbProfile,
				variables: activeProfile?.variables ?? [],
				beforeExecute: profileExecutionGuard(
					$authState.user.id,
					activeProfile?.gameServer?.externalId,
					profileActionRequiresGameProcess(action),
					action.id,
				),
			});

			if (result.ok) notifySuccess(result.message);
			else notifyError(result.message);

			if (result.sentCommands > 0) await loadPlayerState();
		} catch (error) {
			notifyError(
				error instanceof Error ? error.message : "Profile action failed.",
			);
		} finally {
			runningAction = null;
		}
	}

	function cancelActions(): void {
		if (runningAction) return;
		actionMode = false;
	}

	function selectAction(action: PlayerAction): void {
		void navigation.visit(() => {
			actionMode = false;
			selectedUser = null;
			selectedAction = action;
		});
	}

	function openNoteComposer(): void {
		void navigation.visit(() => {
			actionMode = false;
			selectedAction = null;
			selectedUser = null;
			seedActionId = null;
			notesMode = true;
			addingNote = true;
		});
	}

	function updateNoteCount(value: number): void {
		if (dbProfile) dbProfile = { ...dbProfile, noteCount: value };
	}

	function openReferencedUser(user: PlayerNoteUserReference): void {
		void navigation.visit(() => {
			actionMode = false;
			selectedAction = null;
			selectedUser = user;
		});
	}

	function closeReference(): void {
		selectedAction = null;
		selectedUser = null;
	}

	function openNotes(): void {
		void navigation.visit(() => {
			actionMode = false;
			selectedAction = null;
			selectedUser = null;
			notesMode = true;
		});
	}

	function closeNotes(): void {
		addingNote = false;
		seedActionId = null;
		notesMode = false;
	}

	function backFromHeader(): void {
		if (headerBackTarget === `parent`) {
			onBack();
			return;
		}

		if (selectedAction || selectedUser) closeReference();
		else if (notesMode) closeNotes();
		else cancelActions();
	}
	rememberNavigation(
		`playerDetail`,
		() => ({
			infoTab,
			actionMode,
			selectedAction,
			selectedUser,
			addingNote,
			seedActionId,
			notesMode,
		}),
		async (state) => {
			({
				infoTab,
				actionMode,
				selectedAction,
				selectedUser,
				addingNote,
				seedActionId,
				notesMode,
			} = state);
			if (actionMode) await loadActionContext();
		},
		(state) => [
			state.infoTab,
			state.actionMode,
			state.selectedAction?.id,
			state.selectedUser?.id,
			state.addingNote,
			state.notesMode,
		],
	);
</script>

<section
	class="panel-view panel-view--sub player-detail"
	class:player-type__admin={dbProfile?.spellbookRole === `admin` ||
		dbProfile?.spellbookRole === `creator`}
	class:player-type__creator={dbProfile?.spellbookRole === `creator`}
	class:player-type__teammate={dbProfile?.isTeammate === true}
	aria-label="Player detail"
>
	<PanelHeader
		title={playerDisplayName}
		eyebrow={currentPlayer.playfabId}
		eyebrowTooltip={$authState.user?.isSuperadmin && dbProfile ?
			`ID: ${dbProfile.player.id} - Normalized: ${dbProfile.player.latestNormalizedName ?? `-`}`
		:	``}
		leadingIcon="fa-chevron-left"
		leadingLabel={headerBackTarget === "notes" ? "Back to notes"
		: headerBackTarget === "profile" ? "Back to player profile"
		: backLabel}
		onLeading={backFromHeader}
	>
		<svelte:fragment slot="title">
			<PlayerPresenceName
				name={playerDisplayName}
				isOnline={dbProfile?.presence?.isOnline ?? currentPlayer.isOnline}
				presence={dbProfile?.presence}
			>
				{#if dbProfile?.spellbookRole === `creator` || dbProfile?.spellbookRole === `admin`}
					<span
						class="player-role"
						class:player-role--creator={dbProfile.spellbookRole === `creator`}
					>
						<Tag
							label={dbProfile.spellbookRole === `creator` ?
								`SB CREATOR`
							:	`SB ADMIN`}
							icon={dbProfile.spellbookRole === `creator` ?
								`fa-crown`
							:	`fa-shield-halved`}
						/>
					</span>
				{/if}
			</PlayerPresenceName>
		</svelte:fragment>
		<svelte:fragment slot="trailing">
			{#if selectedAction}
				<Tag
					label="Notes"
					suffix={`${noteCount}`}
					icon="fa-note-sticky"
					onClick={openNotes}
				/>
			{:else if notesMode && !selectedUser && !actionMode && !addingNote && dbProfile?.player.id}
				<Tag
					label="New"
					icon="fa-plus"
					tooltip="Create a note"
					onClick={openNoteComposer}
				/>
			{/if}
		</svelte:fragment>
	</PanelHeader>

	<div class="player-detail__body" use:navigationScroll={`playerDetail`}>
		<Tabs
			label="Player profile"
			value={activeTab}
			disabled={runningAction !== null}
			items={[
				{ value: `info`, label: `Info` },
				{ value: `actions`, label: `Actions` },
				{
					value: `notes`,
					label: `Notes`,
					count: `${noteCount}`,
					countTag: true,
				},
				{ value: `history`, label: `History` },
				{
					value: `aliases`,
					label: `Aliases`,
					count: `${nicknameItems.length}`,
					countTag: true,
				},
			]}
			onChange={(value) => void selectTab(value)}
		>
			{#if notice}
				<div class="player-detail__notice" role="status">{notice}</div>
			{/if}
			{#if actionMode}
				<TileGrid columns={2}>
					<ActionRow
						title="Remove offense"
						icon="fa-trash"
						disabled={!dbProfile?.player.id}
						onClick={() => openOffenseRemoval(offenseTarget())}
					/>
					{#if activeOffenseBans.some( (ban) => isActionBanActive(ban, [], new Date($playerStatusNow)), )}<ActionRow
							title="Unban without offense"
							icon="fa-unlock"
							onClick={() =>
								openOffenseRemoval(offenseTarget(), undefined, true)}
						/>{/if}
				</TileGrid>
				{#each actionProfiles as graph (graph.profile.id)}
					<ProfileActionList
						unbanUsesModal
						activeBans={activeOffenseBans}
						gameServerId={activeProfile?.gameServer?.id ?? null}
						title={`${
							graph.profile.owner.type === `user` ? `Personal`
							: graph.profile.owner.type === `team` ? `Team`
							: `Default`
						}: ${graph.profile.name}`}
						actions={graph.actions.filter(
							(action) =>
								action.isEnabled &&
								action.actionDomain === `player` &&
								(!action.commands.some(
									(command) => command.commandType === `unban`,
								) ||
									activeOffenseBans.some(
										(ban) =>
											ban.gameServerId === activeProfile?.gameServer?.id &&
											isActionBanActive(ban, [], new Date($playerStatusNow)),
									)),
						)}
						loading={actionLoading}
						{runningAction}
						gameAvailable={$gameProcessAvailable}
						descriptionFallback="Run this profile action for the selected player."
						emptyMessage="This profile has no enabled player actions."
						onRun={(action) => void runAction(action)}
					/>
				{:else}
					<ProfileActionList
						title="In-Game Action"
						actions={[]}
						loading={actionLoading}
						onRun={() => {}}
					/>
				{/each}
			{:else if selectedAction}
				<PlayerActionDetail action={selectedAction} />
				<div class="offense-actions">
					{#if isActionBanActive(selectedAction, playerActions, new Date($playerStatusNow))}<Button
							label="Unban & remove offense"
							variant="primary"
							onClick={() =>
								void runOffenseAction(offenseTarget(), selectedAction!, true)}
						/>{/if}
					<Button
						label="Remove offense"
						onClick={() =>
							void runOffenseAction(offenseTarget(), selectedAction!, false)}
					/>
				</div>
			{:else if selectedUser}
				<PlayerNoteUserDetail user={selectedUser} />
			{:else if notesMode}
				{#if dbProfile?.player.id}
					<PlayerNotes
						playerId={dbProfile.player.id}
						actions={playerActions}
						bind:adding={addingNote}
						{seedActionId}
						onNoteCountChange={updateNoteCount}
						onOpenAction={selectAction}
						onOpenUser={openReferencedUser}
					/>
				{:else}
					<p class="player-detail__notice">Loading player notes...</p>
				{/if}
			{:else if infoTab === `history`}
				<Wip />
			{:else if infoTab === `aliases`}
				<PlayerTileSection
					title="Aliases"
					items={nicknameItems}
					emptyItem={{
						title: "No aliases",
						subtitle: "No DB alias history",
						icon: "fa-user",
						iconTone: "info",
					}}
				/>
			{:else}
				{#if dbProfile?.player.isWanted}
					<InfoNotice
						message="This player is wanted"
						icon="fa-triangle-exclamation"
						tone="var(--color-danger)"
					/>
				{/if}
				{#if showCurrentGame}
					<PlayerTileSection
						title="Current game"
						help="Live stats from the latest ListPlayers snapshot."
						items={currentGameItems}
						columns={3}
					/>
				{/if}

				<PlayerTileSection
					title="Meta"
					help="Historic data from the admin database and PlayFab."
					items={metaItems}
					busy={profileLoading || playFabLoading}
				/>

				<PlayerActionsSection
					actions={playerActions}
					onSelect={(action) => selectAction(action)}
					onRemove={(action) =>
						runOffenseAction(offenseTarget(), action, false)}
					onUnban={(action) => runOffenseAction(offenseTarget(), action, true)}
				/>
			{/if}
		</Tabs>
	</div>
</section>

<style lang="scss">
	.player-role {
		display: inline-flex;
	}
	.player-role :global(.ui-tag) {
		padding: 3px 4px;
		border-color: var(--color-dark-tertiary);
		background: transparent;
		color: var(--color-light-primary);
		font-weight: var(--font-weight-bold);
		line-height: 1;
		margin-left: 5px;
		gap: 3px;
	}
	.player-role--creator :global(.ui-tag) {
		border-color: #f4c95d;
		background: #f4c95d;
		color: var(--color-dark-primary);
	}

	.player-type__admin {
		background: rgbaa(var(--color-accent-primary), 0);
	}

	.player-type__teammate {
		background: rgbaa(var(--color-accent-primary), 0);
	}

	.player-type__creator {
		// background: rgbaa(var(--color-accent-primary), 0.1);
		// border: 1px solid rgbaa(var(--color-accent-primary), 0.5);
		// border-radius: var(--radius-xl);
	}

	.player-detail__banner {
		padding: var(--gutter-md);
		border: 1px solid var(--color-accent-primary);
		border-radius: var(--radius);
		background: rgbaa(var(--color-accent-primary), 0.12);
		color: var(--color-light-primary);
	}

	.offense-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gutter-sm);
	}
	.player-detail {
		box-sizing: border-box;
		height: 100%;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		gap: var(--gutter-lg);
		padding-top: var(--gutter-lg);
	}

	.player-detail__body {
		min-height: 0;
		display: grid;
		align-content: start;
		gap: var(--gutter-lg);
		padding: 0 var(--gutter-lg) var(--gutter-lg);
		overflow: auto;
	}

	.player-detail__notice {
		border: 1px solid var(--color-dark-secondary);
		border-radius: var(--radius);
		padding: var(--gutter-md);
		background: rgba(3, 12, 18, 0.52);
		color: var(--color-light-secondary);
	}
</style>
