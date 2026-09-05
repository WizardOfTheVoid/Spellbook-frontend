<script lang="ts">
	import { onMount } from "svelte";
	import { extractEnvelope, getCoreApi, getCoreErrorMessage } from "$lib/core";
	import type {
		ActiveServerProfile,
		CurrentGameSnapshot,
		PlayerEntry,
		ProfileOwner,
		ServerProfileAction,
	} from "$lib/core";
	import { authState } from "$lib/auth/user";
	import type { PlayerState } from "$lib/types/playerState";
	import type { LoadState, ServerSummary } from "$lib/types/ui";
	import { formatTime } from "$lib/utils/playerUtils";
	import type { PlayerArchiveResult } from "$lib/utils/playerArchive";
	import { executeProfileAction } from "$lib/utils/profileCommandRunner";
	import { profileExecutionGuard } from "$lib/utils/profileExecutionGuard"
	import { activeProfileGraphs } from "$lib/utils/activeProfiles"
	import { unwrap } from "$lib/utils/apiResult";
	import {
		notifyError,
		notifyInfo,
		notifySuccess,
		notifyWarning,
	} from "$lib/notifications/notificationEvents";
	import {
		CurrentGameSnapshotGate,
		formatServerPlayerCount,
	} from "$lib/utils/serverPlayerPolling";
	import { fetchActiveServerProfile } from "$lib/utils/serverProfilesApi";
	import {
		getServerAvailabilityNotice,
		isGameMainMenu,
	} from "$lib/utils/serverPlayersApi";
	import { getServerDisplayName } from "$lib/utils/displayNames";
	import { serverPlayers } from "$lib/stores/serverPlayersStore";
	import { gameServerRevision } from "$lib/stores/gameServersStore";
	import EmptyState from "$lib/components/ui/EmptyState.svelte";
	import IconButton from "$lib/components/ui/IconButton.svelte";
	import Input from "$lib/components/ui/Input.svelte";
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte";
	import Tile from "$lib/components/ui/Tile.svelte";
	import TileGrid from "$lib/components/ui/TileGrid.svelte";
	import PlayerArchive from "./PlayerArchive.svelte";
	import ProfileActionList from "./ProfileActionList.svelte";
	import { gameProcessAvailable } from "$lib/stores/gameProcessAvailabilityStore"
	import {
		GAME_PROCESS_REQUIRED_TOOLTIP,
		profileActionRequiresGameProcess,
	} from "$lib/utils/gameProcessActions"

	export let hidden = false;
	export let isActive = false;
	export let onSelectPlayer: (player: PlayerState) => void;
	export let onOpenProfile: (profileId: number, owner?: ProfileOwner) => void;
	export let onSummaryChange: (summary: ServerSummary) => void;

	const gameCommands = [
		{ label: `End round`, command: `TBSEndGame 1` },
		{ label: `List players`, command: `Listplayers` },
		{ label: `Add 1 bot`, command: `AddBots 1 1` },
		{ label: `Remove all bots`, command: `RemoveBots 1 1` },
	]

	let livePlayers: PlayerEntry[] = [];
	let hasCurrentSnapshot = false
	let playerRefreshRevision = 0;
	let serverName = "Current game server";
	let serverExternalId: string | null = null;
	let serverAddress: string | null = null;
	let serverDisplayName = "Current game server";
	let playerState: LoadState = "idle";
	let lastPlayerRefresh = "--:--:--";
	let isRefreshingPlayers = false;
	let silentPlayerRefresh = false
	let playerEnrichmentPending = false
	let lastSummaryKey = "";
	let activeProfileName = "";
	let activeProfileId: number | null = null;
	let activeProfile: ActiveServerProfile | null = null;
	let activeProfileKey = "";
	let serverActionsMode = false;
	let serverActionLoading = false;
	let runningServerAction: ServerProfileAction | null = null;
	let runningGameCommand: string | null = null
	let stageTimeMinutes = `10`
	let lastServerNotice = "";
	let lastPlayerError = "";
	let lastPlayerWarning = "";

	$: isMainMenu = isGameMainMenu(serverName, livePlayers.length)
	$: commandRunning = runningServerAction !== null || runningGameCommand !== null
	$: validStageTime = /^[1-9]\d*$/.test(stageTimeMinutes)
	$: profileKey = `${serverExternalId ?? ""}:${$gameServerRevision}`;
	// The stored pretty name wins once the active profile resolves; the Core-derived name covers the gap.
	$: resolvedDisplayName =
		isMainMenu ? `Main Menu`
		: activeProfile?.gameServer?.displayName?.trim() || serverDisplayName;
	$: headerTitle = isMainMenu
		? resolvedDisplayName
		: `${resolvedDisplayName} ${formatServerPlayerCount(
			livePlayers.length,
			activeProfile?.gameServer?.maxPlayers ?? null,
		)}`
	$: displayedProfileName = activeProfileName;
	$: openProfile =
		activeProfileId ?
			() => {
				const owner = activeProfile?.profile.profile.owner;
				onOpenProfile(
					activeProfileId as number,
					owner?.type === "system" ? undefined : owner,
				);
			}
		: null;
	$: actionProfiles = activeProfileGraphs(activeProfile)

	$: {
		const summaryKey = `${serverExternalId ?? ""}:${serverName}:${serverAddress ?? ""}:${resolvedDisplayName}:${playerState}`;
		if (summaryKey !== lastSummaryKey) {
			lastSummaryKey = summaryKey;
			onSummaryChange({
				serverExternalId,
				serverName,
				serverAddress,
				serverDisplayName: resolvedDisplayName,
				playerState,
			});
		}
	}

	$: if (isActive && hasCurrentSnapshot && profileKey !== activeProfileKey) {
		activeProfileKey = profileKey;
		void refreshActiveProfile();
	}

	onMount(() => {
		const api = getCoreApi()
		const gate = new CurrentGameSnapshotGate()
		const unsubscribe = api.onCurrentGameSnapshot(snapshot => {
			if (gate.acceptEvent(snapshot)) applySnapshot(snapshot)
		})
		void api.currentGameSnapshot()
			.then(snapshot => {
				if (gate.acceptHydration(snapshot)) applySnapshot(snapshot)
			})
			.catch(error => notifyPlayerError(
				error instanceof Error ? error.message : `Current game snapshot failed.`,
			))

		return unsubscribe
	});

	async function refreshPlayers(): Promise<void> {
		if (isRefreshingPlayers) return;

		isRefreshingPlayers = true;
		playerState = "loading";

		try {
			const result = await getCoreApi().refreshCurrentGameSnapshot()
			if (!result.ok || extractEnvelope<unknown>(result)?.ok === false) {
				throw new Error(getCoreErrorMessage(result, `ListPlayers failed.`))
			}
		} catch (error) {
			notifyPlayerError(
				error instanceof Error ? error.message : "Player refresh failed.",
			)
			playerState = "error";
		} finally {
			if (playerState === "loading" && !playerEnrichmentPending) {
				playerState = livePlayers.length > 0 ? "ok" : "idle"
			}
			isRefreshingPlayers = false;
		}
	}

	function applySnapshot(snapshot: CurrentGameSnapshot | null): void {
		if (!snapshot) {
			clearSnapshot()
			return
		}

		silentPlayerRefresh = playerRefreshRevision > 0
		hasCurrentSnapshot = true
		livePlayers = snapshot.players.map(player => ({ ...player }))
		playerRefreshRevision += 1
		serverExternalId = snapshot.externalId
		serverName = snapshot.serverName?.trim() || `Current game server`
		serverAddress = snapshot.serverAddress
		serverDisplayName = getServerDisplayName(serverName)
		lastPlayerRefresh = formatTime(new Date(snapshot.observedAt))
		lastPlayerError = ``
		notifyServerNotice(getServerAvailabilityNotice(serverName, livePlayers))
		notifyPlayerWarnings(snapshot.parseWarnings)

		const mainMenu = isGameMainMenu(serverName, livePlayers.length)
		playerEnrichmentPending = !mainMenu
		if (mainMenu) {
			silentPlayerRefresh = false
			playerState = "ok"
			serverPlayers.set([])
		}
	}

	function clearSnapshot(): void {
		livePlayers = []
		hasCurrentSnapshot = false
		playerRefreshRevision += 1
		serverPlayers.set([])
		serverExternalId = null
		serverName = `Current game server`
		serverAddress = null
		serverDisplayName = `Current game server`
		playerState = `idle`
		lastPlayerRefresh = `--:--:--`
		silentPlayerRefresh = false
		playerEnrichmentPending = false
		activeProfile = null
		activeProfileName = ``
		activeProfileId = null
		activeProfileKey = ``
		serverActionsMode = false
		lastServerNotice = ``
		lastPlayerError = ``
		lastPlayerWarning = ``
	}

	function handleArchiveResult(result: PlayerArchiveResult): void {
		if (result.state === "idle") return;
		playerState = result.state;
		if (result.state === "ok" && result.rosterPlayers !== null) {
			serverPlayers.set(result.rosterPlayers);
		} else if (result.state === "error" && result.rosterPlayers !== null) {
			serverPlayers.set(result.rosterPlayers)
		}
		if (result.refreshedAt) lastPlayerRefresh = formatTime(new Date(result.refreshedAt));

		if (result.error) notifyPlayerError(result.error);
		else if (result.state === "ok") lastPlayerError = "";
	}

	function handlePlayerArchivePending(pending: boolean): void {
		playerEnrichmentPending = pending
		if (!pending) silentPlayerRefresh = false
	}

	async function refreshActiveProfile(): Promise<void> {
		try {
			activeProfile = await fetchActiveServerProfile(serverExternalId);
			activeProfileName = activeProfile.profile.profile.name;
			activeProfileId = activeProfile.profile.profile.id;
		} catch {
			activeProfile = null;
			activeProfileName = "";
			activeProfileId = null;
		}
	}

	async function openServerActions(): Promise<void> {
		serverActionsMode = true;

		if (!$authState.user) {
			notifyError("Sign in before using server actions.", {
				dedupeKey: "server-actions:no-user",
			});
			return;
		}

		serverActionLoading = true;

		try {
			await refreshActiveProfile();
		} catch (error) {
			notifyError(
				error instanceof Error ?
					error.message
				:	"Server actions failed to load.",
				{ dedupeKey: "server-actions:load" },
			);
		} finally {
			serverActionLoading = false;
		}
	}

	function closeServerActions(): void {
		if (commandRunning) return;

		serverActionsMode = false;
	}

	async function runGameCommand(label: string, command: string): Promise<void> {
		if (!$authState.user || commandRunning) return
		runningGameCommand = command

		try {
			const listPlayers = command === `Listplayers`
			const result = await getCoreApi().sendCommand(command, listPlayers, !listPlayers)
			await unwrap(result, `${label} failed.`)
			notifySuccess(`${label} command sent.`)
		} catch (error) {
			notifyError(error instanceof Error ? error.message : `${label} failed.`)
		} finally {
			runningGameCommand = null
		}
	}

	async function runServerAction(action: ServerProfileAction): Promise<void> {
		if (!$authState.user || commandRunning) return;
		if (profileActionRequiresGameProcess(action) && !$gameProcessAvailable) {
			notifyWarning(GAME_PROCESS_REQUIRED_TOOLTIP)
			return
		}
		runningServerAction = action;

		try {
			const result = await executeProfileAction(action, {
				player: null,
				admin: $authState.user,
				serverName,
				gameServer: activeProfile?.gameServer ?? null,
				dbProfile: null,
				variables: activeProfile?.variables ?? [],
				beforeExecute: profileExecutionGuard($authState.user.id, activeProfile?.gameServer?.externalId, profileActionRequiresGameProcess(action)),
			});

			if (result.ok) {
				notifySuccess(result.message);
			} else {
				notifyError(result.message);
			}
		} catch (error) {
			notifyError(
				error instanceof Error ? error.message : "Server action failed.",
			);
		} finally {
			runningServerAction = null;
		}
	}

	function notifyServerNotice(message: string): void {
		if (!message) {
			lastServerNotice = "";
			return;
		}

		if (message !== lastServerNotice) {
			notifyInfo(message, { dedupeKey: "server-availability" });
			lastServerNotice = message;
		}
	}

	function notifyPlayerError(message: string): void {
		if (message !== lastPlayerError) {
			notifyError(message, { dedupeKey: "server-players:error" });
			lastPlayerError = message;
		}
	}

	function notifyPlayerWarnings(warnings: readonly string[]): void {
		const message = warnings[0] ?? "";

		if (!message) {
			lastPlayerWarning = "";
			return;
		}

		if (message !== lastPlayerWarning) {
			notifyWarning(message, { dedupeKey: "server-players:warning" });
			lastPlayerWarning = message;
		}
	}
</script>

<section
	{hidden}
	class="panel-view player-list"
	aria-label="Server player list"
>
	<PanelHeader
		title={headerTitle}
		eyebrow={`Game Server ${playerState ? `| ${playerState.toUpperCase()}` : ""}`}
		leadingIcon={serverActionsMode ? "fa-chevron-left" : null}
		leadingLabel="Back to player list"
		onLeading={serverActionsMode ? closeServerActions : null}
	>
		<svelte:fragment slot="trailing">
			<IconButton
				icon="fa-rotate"
				ariaLabel="Refresh players"
				disabled={isRefreshingPlayers}
				onClick={() => void refreshPlayers()}
			/>
			<time>{lastPlayerRefresh}</time>
		</svelte:fragment>
	</PanelHeader>

	{#if serverActionsMode}
		<div class="player-list__body">
			<PanelHeader variant="section" title="Game commands" />
			<div class="server-time">
				<IconButton
					icon="fa-plus"
					ariaLabel="Add server time"
					size="md"
					tone="success"
					disabled={commandRunning || !validStageTime}
					onClick={() => void runGameCommand(`Add time`, `TBSAddStageTime +${stageTimeMinutes}`)}
				/>
				<Input
					label="Server time"
					type="number"
					value={stageTimeMinutes}
					min={1}
					step={1}
					required
					error={validStageTime ? null : `Enter a whole number greater than 0.`}
					disabled={commandRunning}
					onChange={(value) => (stageTimeMinutes = value)}
				/>
				<IconButton
					icon="fa-minus"
					ariaLabel="Remove server time"
					size="md"
					tone="danger"
					disabled={commandRunning || !validStageTime}
					onClick={() => void runGameCommand(`Remove time`, `TBSAddStageTime -${stageTimeMinutes}`)}
				/>
			</div>
			<TileGrid columns={2}>
				{#each gameCommands as action (action.command)}
					<Tile
						title={action.label}
						subtitle={action.command}
						icon="fa-bolt"
						iconTone="accent"
						disabled={commandRunning}
						onClick={() => void runGameCommand(action.label, action.command)}
					/>
				{/each}
			</TileGrid>
			<hr class="server-actions__divider" />
			{#each actionProfiles as graph}
			<ProfileActionList
				title={`${graph.profile.owner.type === `user` ? `Personal` : graph.profile.owner.type === `team` ? `Team` : `Default`}: ${graph.profile.name}`}
				actions={graph.actions.filter(action => action.isEnabled && action.actionDomain === `server`)}
				loading={serverActionLoading}
				runningAction={runningServerAction}
				gameAvailable={$gameProcessAvailable}
				disabled={runningGameCommand !== null}
				descriptionFallback="Run this server profile action."
				emptyMessage="This profile has no enabled server actions."
				onRun={(action) => void runServerAction(action)}
			/>
			{:else}
				<ProfileActionList title="Server actions" actions={[]} loading={serverActionLoading} emptyMessage="No active profile could be loaded." onRun={() => {}} />
			{/each}
		</div>
	{:else if !hasCurrentSnapshot}
		<div class="player-list__body">
			<EmptyState
				title="No current server"
				message="Refresh after joining a server to view its players."
			/>
		</div>
	{:else}
		<div class="meta">
			<TileGrid columns={2}>
				<Tile
					title="Actions"
					subtitle="Global actions"
					icon="fa-bolt"
					iconTone="accent"
					onClick={() => void openServerActions()}
				/>
				<Tile
					title="Settings"
					subtitle={displayedProfileName || "Change server settings"}
					icon="fa-gear"
					iconTone="info"
					onClick={openProfile}
				/>
			</TileGrid>

		</div>

		{#if isMainMenu}
			<div class="player-list__body">
				<EmptyState
					title="Main Menu"
					message="Join a server to view its players."
				/>
			</div>
		{:else}
			<PlayerArchive
				active={isActive}
				{livePlayers}
				refreshRevision={playerRefreshRevision}
				silentRefresh={silentPlayerRefresh}
				onSelect={onSelectPlayer}
				onResult={handleArchiveResult}
				onRequestPendingChange={handlePlayerArchivePending}
			/>
		{/if}
	{/if}
</section>

<style lang="scss">
	.player-list {
		box-sizing: border-box;
		padding-top: var(--gutter-lg);
		height: 100%;
		display: grid;
		grid-template-rows: auto auto minmax(0, 1fr);
		align-content: start;
		gap: var(--gutter-lg);
	}

	.meta {
		display: grid;
		margin: 0 var(--gutter-lg);
		gap: var(--gutter);
	}

	.player-list__body {
		min-height: 0;
		display: grid;
		align-content: start;
		gap: var(--gutter-md);
		padding: 0 var(--gutter-lg);
		overflow: hidden;
		overflow-y: auto;
	}

	.server-actions__divider {
		width: 100%;
		margin: var(--gutter-sm) 0;
		border: 0;
		border-top: 1px solid var(--color-dark-secondary);
	}

	.server-time {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: end;
		gap: var(--gutter-md);
	}
</style>
