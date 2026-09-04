<script lang="ts">
	import { onMount } from "svelte";
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
	import { unbanPlayer } from "$lib/utils/unbanPlayer"
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
	import Tag from "$lib/components/ui/Tag.svelte"
	import Tile from "$lib/components/ui/Tile.svelte";
	import TileGrid from "$lib/components/ui/TileGrid.svelte";
	import PlayerTileSection from "./PlayerTileSection.svelte";
	import PlayerActionDetail from "./PlayerActionDetail.svelte";
	import PlayerNotes from "./PlayerNotes.svelte";
	import PlayerNoteUserDetail from "./PlayerNoteUserDetail.svelte";
	import PlayerActionsSection from "./PlayerActionsSection.svelte";
	import ProfileActionList from "./ProfileActionList.svelte";
	import { playerDetailBackTarget } from "./playerDetailNavigation"
	import { gameProcessAvailable } from "$lib/stores/gameProcessAvailabilityStore"
	import {
		GAME_PROCESS_REQUIRED_TOOLTIP,
		profileActionRequiresGameProcess,
	} from "$lib/utils/gameProcessActions"

	export let player: PlayerState;
	export let serverExternalId: string | null = null;
	export let serverName = "Current game server";
	export let serverAddress: string | null = null;
	export let backLabel: string;
	export let onBack: () => void;
	export let notice: string | null = null;
	export let initialSubpage: "notes" | null = null;

	const PLAYER_STATE_REFRESH_MS = 5000;

	let currentPlayer: PlayerState = player;
	let currentServerExternalId = serverExternalId;
	let currentServerName = serverName;
	let currentServerAddress = serverAddress;
	let appliedServerName = serverName;
	let appliedServerExternalId = serverExternalId;
	let appliedServerAddress = serverAddress;
	let dbProfile: PlayerDbProfile | null = null;
	let profileLoading = false;
	let playFabLoading = false;
	let playFabRefreshAttemptedId = "";
	let lastProfileError = "";
	let isRefreshingPlayerState = false;
	let pendingPlayerStateRefresh = false;
	let pendingPlayerStateRefreshLoading = false;
	let actionMode = false;
	let actionLoading = false;
	let activeProfile: ActiveServerProfile | null = null;
	let runningAction: ServerProfileAction | null = null;
	let loadedPlayfabId = "";
	let selectedAction: PlayerAction | null = null;
	let selectedUser: PlayerNoteUserReference | null = null;
	let addingNote = false;
	let seedActionId: number | null = null;
	let notesMode = initialSubpage === "notes";

	$: if (player.playfabId !== loadedPlayfabId) {
		loadedPlayfabId = player.playfabId;
		currentPlayer = player;
		playFabLoading = false;
		playFabRefreshAttemptedId = "";
		actionMode = false;
		activeProfile = null;
		selectedAction = null;
		selectedUser = null;
		addingNote = false;
		seedActionId = null;
		notesMode = initialSubpage === "notes";
		void loadPlayerState();
	}

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

		return () => window.clearInterval(refreshTimer);
	});

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
	$: nicknameItems = buildNicknameItems(nicknames);
	$: enabledActions =
		activeProfile?.profile.actions.filter(
			(action) => action.isEnabled && action.actionDomain === "player",
		) ?? [];
	$: playerDisplayName = getPlayerDisplayName(currentPlayer.name);
	$: headerBackTarget = playerDetailBackTarget(actionMode, selectedAction !== null, selectedUser !== null, notesMode)

	async function loadPlayerState(showLoading = true): Promise<void> {
		if (isRefreshingPlayerState) {
			pendingPlayerStateRefresh = true;
			pendingPlayerStateRefreshLoading ||= showLoading;
			return;
		}

		const playfabId = currentPlayer.playfabId;
		isRefreshingPlayerState = true;
		if (showLoading) profileLoading = true;

		try {
			const snapshot = await loadPlayerProfileSnapshot(currentPlayer, {
				serverExternalId: currentServerExternalId,
				serverName: currentServerName,
				serverAddress: currentServerAddress,
			});
			if (playfabId !== loadedPlayfabId) return;

			if (snapshot.serverName !== null) currentServerName = snapshot.serverName;
			currentServerExternalId = snapshot.serverExternalId;
			if (snapshot.serverAddress !== null) {
				currentServerAddress = snapshot.serverAddress;
			}

			dbProfile = snapshot.dbProfile;

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
		playFabLoading = true;

		try {
			const refreshed = await refreshPlayerProfile(playfabId);
			if (playfabId !== loadedPlayfabId) return;

			dbProfile = refreshed;
			currentPlayer = mergePlayerState(currentPlayer.livePlayer, refreshed.player);

			if (refreshed.player.playfab.freshness.refreshFailed) {
				notifyWarning("PlayFab refresh failed. Showing cached data.", {
					dedupeKey: `player-playfab:${playfabId}`,
				});
			}
		} catch (error) {
			if (playfabId === loadedPlayfabId) {
				notifyWarning(
					error instanceof Error ? error.message : "Player profile refresh failed.",
					{ dedupeKey: `player-playfab:${playfabId}` },
				);
			}
		} finally {
			if (playfabId === loadedPlayfabId) playFabLoading = false;
		}
	}

	async function enterActions(): Promise<void> {
		selectedAction = null;
		actionMode = true;
		await loadActionContext();
	}

	async function loadActionContext(): Promise<void> {
		if (!$authState.user) {
			notifyError("Sign in before using profile actions.", {
				dedupeKey: "player-actions:no-user",
			});
			return;
		}

		actionLoading = true;

		try {
			activeProfile = await loadPlayerProfileActionContext(currentServerExternalId);
		} catch (error) {
			notifyError(
				error instanceof Error ?
					error.message
				:	"Profile actions failed to load.",
				{ dedupeKey: "player-actions:load" },
			);
		} finally {
			actionLoading = false;
		}
	}

	async function runAction(action: ServerProfileAction): Promise<void> {
		if (!$authState.user || runningAction) return;
		if (profileActionRequiresGameProcess(action) && !$gameProcessAvailable) {
			notifyWarning(GAME_PROCESS_REQUIRED_TOOLTIP)
			return
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

	async function unbanAction(action: PlayerAction): Promise<void> {
		if (!$gameProcessAvailable) {
			notifyWarning(GAME_PROCESS_REQUIRED_TOOLTIP)
			return
		}
		try {
			const result = await unbanPlayer({
				playerId: action.playerId,
				playfabId: currentPlayer.playfabId,
				playerName: playerDisplayName,
				actionId: action.id,
			})

			if (result.ok) {
				notifySuccess(result.message)
				await loadPlayerState()
			} else if (result.auditFailed) {
				notifyWarning(result.message)
			} else {
				notifyError(result.message)
			}
		} catch (error) {
			notifyError(error instanceof Error ? error.message : `Unban failed.`)
		}
	}

	function selectAction(action: PlayerAction): void {
		actionMode = false;
		selectedUser = null;
		selectedAction = action;
	}

	function openNoteComposer(): void {
		actionMode = false;
		selectedAction = null;
		selectedUser = null;
		seedActionId = null;
		notesMode = true;
		addingNote = true;
	}

	function updateNoteCount(value: number): void {
		if (dbProfile) dbProfile = { ...dbProfile, noteCount: value };
	}

	function openReferencedUser(user: PlayerNoteUserReference): void {
		actionMode = false;
		selectedAction = null;
		selectedUser = user;
	}

	function closeReference(): void {
		selectedAction = null;
		selectedUser = null;
	}

	function openNotes(): void {
		actionMode = false;
		selectedAction = null;
		selectedUser = null;
		notesMode = true;
	}

	function closeNotes(): void {
		addingNote = false;
		seedActionId = null;
		notesMode = false;
	}

	function backFromHeader(): void {
		if (headerBackTarget === `parent`) {
			onBack()
			return
		}

		if (selectedAction || selectedUser) closeReference()
		else if (notesMode) closeNotes()
		else cancelActions()
	}
</script>

<section
	class="panel-view panel-view--sub player-detail"
	aria-label="Player detail"
>
	<PanelHeader
		title={playerDisplayName}
		eyebrow={currentPlayer.playfabId}
		leadingIcon="fa-chevron-left"
		leadingLabel={headerBackTarget === "notes" ? "Back to notes" : headerBackTarget === "profile" ? "Back to player profile" : backLabel}
		onLeading={backFromHeader}
	>
		<svelte:fragment slot="trailing">
			{#if selectedAction}
				<Tag
					label="Notes"
					suffix={`(${noteCount})`}
					icon="fa-note-sticky"
					onClick={openNotes}
				/>
			{:else if notesMode && !selectedUser && !actionMode && !addingNote && dbProfile?.player.id}
				<Tag label="New" icon="fa-plus" tooltip="Create a note" onClick={openNoteComposer} />
			{/if}
		</svelte:fragment>
	</PanelHeader>

	<div class="player-detail__body">
		{#if notice}
			<div class="player-detail__notice" role="status">{notice}</div>
		{/if}
		{#if actionMode}
			<ProfileActionList
				title={`In-game actions: ${activeProfile?.profile.profile.name ?? "Player actions"}`}
				actions={enabledActions}
				loading={actionLoading}
				{runningAction}
				gameAvailable={$gameProcessAvailable}
				descriptionFallback="Run this profile action for the selected player."
				emptyMessage="This profile has no enabled player actions."
				onRun={(action) => void runAction(action)}
			/>
		{:else if selectedAction}
			<PlayerActionDetail action={selectedAction} />
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
		{:else}
			<TileGrid columns={2}>
				<Tile
					title="Actions"
					subtitle="Player actions"
					icon="fa-layer-group"
					iconTone="accent"
					ariaLabel={`Actions for ${playerDisplayName}`}
					onClick={() => void enterActions()}
				/>
				<Tile
					title="Notes"
					suffix={`(${noteCount})`}
					subtitle="Player notes"
					icon="fa-note-sticky"
					iconTone="info"
					ariaLabel={`Notes for ${playerDisplayName}`}
					disabled={!dbProfile?.player.id}
					onClick={openNotes}
				/>
			</TileGrid>

			<PlayerTileSection
				title="Current game"
				help="Live stats from the latest ListPlayers snapshot."
				items={currentGameItems}
				columns={3}
			/>

			<PlayerTileSection
				title="Meta"
				help="Historic data from the admin database and PlayFab."
				items={metaItems}
				busy={profileLoading || playFabLoading}
			/>

			<PlayerActionsSection
				actions={playerActions}
				onSelect={(action) => selectAction(action)}
				onUnban={unbanAction}
				onOpenNotes={openNotes}
				{noteCount}
			/>

			<PlayerTileSection
				title="Nicknames"
				items={nicknameItems}
				emptyItem={{
					title: "No names",
					subtitle: "No DB name history",
					icon: "fa-user",
					iconTone: "info",
				}}
			/>
		{/if}
	</div>
</section>

<style lang="scss">
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
