<script lang="ts">
	import {
		navigation,
		rememberNavigation,
		navigationScroll,
	} from "$lib/navigation/navigation";
	import { extractEnvelope, getCoreApi, getCoreErrorMessage } from "$lib/core";
	import type {
		ProfileOwner,
		ServerProfileAction,
	} from "$lib/core";
	import { authState } from "$lib/auth/user";
	import type { PlayerState } from "$lib/types/playerState";
	import { formatTime } from "$lib/utils/playerUtils";
	import type { PlayerArchiveResult } from "$lib/utils/playerArchive";
	import { executeProfileAction } from "$lib/utils/profileCommandRunner";
	import { profileExecutionGuard } from "$lib/utils/profileExecutionGuard";
	import { activeProfileGraphs } from "$lib/utils/activeProfiles";
	import { unwrap } from "$lib/utils/apiResult";
	import {
		notifyError,
		notifyInfo,
		notifySuccess,
		notifyWarning,
	} from "$lib/notifications/notificationEvents";
	import {
		formatServerPlayerCount,
	} from "$lib/utils/serverPlayerPolling";
	import {
		getServerAvailabilityNotice,
	} from "$lib/utils/serverPlayersApi";
	import { gameState } from '$lib/gameState/gameStateStore'
	import { isGameRunning, isMainMenu as checkMainMenu, isInGameServer } from '../../../../../shared/gameState'
	import { currentServer, currentServerSummary } from '$lib/gameState/currentServerStore'
	import EmptyState from "$lib/components/ui/EmptyState.svelte";
	import IconButton from "$lib/components/ui/IconButton.svelte";
	import Input from "$lib/components/ui/Input.svelte";
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte";
	import Tile from "$lib/components/ui/Tile.svelte";
	import TileGrid from "$lib/components/ui/TileGrid.svelte";
	import PlayerArchive from "./PlayerArchive.svelte";
	import ProfileActionList from "./ProfileActionList.svelte";
	import { consoleSetup } from '$lib/consoleSetup/consoleSetupStore'
	export let onOpenSettings: () => void
	import ServerPlayerMenu from "./ServerPlayerMenu.svelte"
	import { gameProcessAvailable } from "$lib/stores/gameProcessAvailabilityStore";
	import {
		GAME_PROCESS_REQUIRED_TOOLTIP,
		profileActionRequiresGameProcess,
	} from "$lib/utils/gameProcessActions";

	export let hidden = false;
	export let isActive = false;
	export let onSelectPlayer: (player: PlayerState) => void;
	export let onOpenProfile: (profileId: number, owner?: ProfileOwner) => void;
	export let onOpenTeam: (teamId: number) => void;

	const gameCommands = [
		{ label: `End round`, command: `TBSEndGame 1` },
		{ label: `List players`, command: `Listplayers` },
		{ label: `Add 1 bot`, command: `AddBots 1 1` },
		{ label: `Remove all bots`, command: `RemoveBots 1 1` },
	];

	let isRefreshingPlayers = false
	let serverActionsMode = false;
	let serverActionLoading = false;
	let runningServerAction: ServerProfileAction | null = null;
	let runningGameCommand: string | null = null;
	let stageTimeMinutes = `10`;
	let lastServerNotice = "";
	let lastPlayerError = "";
	let lastPlayerWarning = "";

	$: gameRunning = isGameRunning($gameState)
	$: isMainMenu = checkMainMenu($gameState)
	$: inGameServer = isInGameServer($gameState)
	$: commandRunning =
		runningServerAction !== null || runningGameCommand !== null;
	$: validStageTime = /^[1-9]\d*$/.test(stageTimeMinutes);
	$: snapshot = $currentServer.snapshot
	$: hasCurrentSnapshot = snapshot !== null
	$: livePlayers = [...(snapshot?.players ?? [])]
	$: activeProfile = $currentServer.activeProfile
	$: activeProfileId = activeProfile?.profile.profile.id ?? null
	$: serverName = $currentServerSummary.serverName
	$: resolvedDisplayName = $currentServerSummary.serverDisplayName
	$: playerState = isRefreshingPlayers ? `loading` : $currentServer.playerState
	$: lastPlayerRefresh = snapshot ? formatTime(new Date(snapshot.observedAt)) : `--:--:--`
	$: preparedRoster = { players: $currentServer.players, state: $currentServer.playerState,
		error: $currentServer.error, refreshedAt: snapshot?.observedAt ?? null }
	$: if (snapshot) {
		notifyServerNotice(getServerAvailabilityNotice(serverName, livePlayers))
		notifyPlayerWarnings(snapshot.parseWarnings)
	} else {
		serverActionsMode = false
		lastServerNotice = ``
		lastPlayerError = ``
		lastPlayerWarning = ``
	}
	$: headerTitle =
		!inGameServer ? resolvedDisplayName : (
			`${resolvedDisplayName} ${formatServerPlayerCount(
				livePlayers.length,
				activeProfile?.gameServer?.maxPlayers ?? null,
			)}`
		);
	$: openProfile =
		activeProfileId ?
			() => {
				const owner = activeProfile?.profile.profile.owner;
				onOpenProfile(
					activeProfileId as number,
					owner?.type === "system" ? undefined : owner,
				);
			}
		:	null;
	$: actionProfiles = activeProfileGraphs(activeProfile);

	async function refreshPlayers(): Promise<void> {
		if (isRefreshingPlayers || !gameState.isGameRunning()) return;

		isRefreshingPlayers = true;

		try {
			const result = await getCoreApi().refreshCurrentGameSnapshot();
			if (!result.ok || extractEnvelope<unknown>(result)?.ok === false) {
				throw new Error(getCoreErrorMessage(result, `ListPlayers failed.`));
			}
		} catch (error) {
			notifyPlayerError(
				error instanceof Error ? error.message : "Player refresh failed.",
			);
		} finally {
			isRefreshingPlayers = false;
		}
	}

	function handleArchiveResult(result: PlayerArchiveResult): void {
		if (result.error) notifyPlayerError(result.error)
		else if (result.state === `ok`) lastPlayerError = ``
	}

	async function refreshActiveProfile(): Promise<void> {
		await currentServer.refreshProfile()
	}

	async function openServerActions(): Promise<void> {
		await navigation.visit(async () => {
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
		});
	}

	function closeServerActions(): void {
		if (commandRunning) return;

		serverActionsMode = false;
	}

	async function runGameCommand(label: string, command: string): Promise<void> {
		if (!$authState.user || commandRunning) return;
		runningGameCommand = command;

		try {
			const listPlayers = command === `Listplayers`;
			const result = await getCoreApi().sendCommand(
				command,
				listPlayers,
				!listPlayers,
			);
			await unwrap(result, `${label} failed.`);
			notifySuccess(`${label} command sent.`);
		} catch (error) {
			notifyError(error instanceof Error ? error.message : `${label} failed.`);
		} finally {
			runningGameCommand = null;
		}
	}

	async function runServerAction(action: ServerProfileAction): Promise<void> {
		if (!$authState.user || commandRunning) return;
		if (profileActionRequiresGameProcess(action) && !$gameProcessAvailable) {
			notifyWarning(GAME_PROCESS_REQUIRED_TOOLTIP);
			return;
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
				beforeExecute: profileExecutionGuard(
					$authState.user.id,
					activeProfile?.gameServer?.externalId,
					profileActionRequiresGameProcess(action),
					action.id,
				),
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
	rememberNavigation(
		`serverActions`,
		() => serverActionsMode,
		async (value) => {
			serverActionsMode = value;
			if (value) await refreshActiveProfile();
		},
	);
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
				disabled={isRefreshingPlayers || !gameRunning}
				onClick={() => void refreshPlayers()}
			/>
			<time>{lastPlayerRefresh}</time>
			{#if hasCurrentSnapshot && inGameServer}
				<ServerPlayerMenu
					active={!hidden && isActive}
					teamId={activeProfile?.ownerTeamId ?? null}
					{onOpenTeam}
					onOpenSettings={openProfile}
				/>
			{/if}
		</svelte:fragment>
	</PanelHeader>

	{#if !$gameState.available || !gameRunning || isMainMenu}
		<div class="player-list__body" use:navigationScroll={`serverPlayers`}>
			<EmptyState title={resolvedDisplayName} message={!$gameState.available
				? `Waiting for game status. Current server players are unavailable.`
				: !gameRunning ? `Start Chivalry 2 and join a server to view its players.`
				: `You are in the Main Menu. Join a server to view its players.`} />
		</div>
	{:else if serverActionsMode && inGameServer}
		<div class="player-list__body" use:navigationScroll={`serverPlayers`}>
			{#if $consoleSetup.commandsBlocked}
				<EmptyState title="Console setup needs attention" message={`${$consoleSetup.commandIssue} Click to open Settings.`} onClick={onOpenSettings} />
			{:else}
			<PanelHeader variant="section" title="Game commands" />
			<div class="server-time">
				<IconButton
					icon="fa-plus"
					ariaLabel="Add server time"
					size="md"
					tone="success"
					disabled={commandRunning || !validStageTime}
					onClick={() =>
						void runGameCommand(
							`Add time`,
							`TBSAddStageTime +${stageTimeMinutes}`,
						)}
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
					onClick={() =>
						void runGameCommand(
							`Remove time`,
							`TBSAddStageTime -${stageTimeMinutes}`,
						)}
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
					title={`${
						graph.profile.owner.type === `user` ? `Personal`
						: graph.profile.owner.type === `team` ? `Team`
						: `Default`
					}: ${graph.profile.name}`}
					actions={graph.actions.filter(
						(action) => action.isEnabled && action.actionDomain === `server`,
					)}
					loading={serverActionLoading}
					runningAction={runningServerAction}
					gameAvailable={$gameProcessAvailable}
					disabled={runningGameCommand !== null}
					descriptionFallback="Run this server profile action."
					emptyMessage="This profile has no enabled server actions."
					onRun={(action) => void runServerAction(action)}
				/>
			{:else}
				<ProfileActionList
					title="Server actions"
					actions={[]}
					loading={serverActionLoading}
					emptyMessage="No active profile could be loaded."
					onRun={() => {}}
				/>
			{/each}
			{/if}
		</div>
	{:else if !hasCurrentSnapshot || !inGameServer}
		<div class="player-list__body" use:navigationScroll={`serverPlayers`}>
			<EmptyState
				title="No current server"
				message="Refresh after joining a server to view its players."
			/>
		</div>
	{:else}
		<div class="meta">
			<Tile
				title="Actions"
				subtitle="Server actions"
				icon="fa-bolt"
				iconTone="accent"
				onClick={() => void openServerActions()}
			/>
		</div>

		<PlayerArchive
			active={isActive}
			{livePlayers}
			refreshRevision={$currentServer.revision}
			silentRefresh={true}
			{preparedRoster}
			onSelect={onSelectPlayer}
			onResult={handleArchiveResult}
		/>
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
