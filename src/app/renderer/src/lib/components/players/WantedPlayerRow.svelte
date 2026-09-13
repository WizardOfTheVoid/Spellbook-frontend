<script lang="ts">
	import { consoleSetup } from '$lib/consoleSetup/consoleSetupStore'
	import { onDestroy } from "svelte"
	import type { WantedPlayerListItem } from "$lib/core"
	import { authState } from "$lib/auth/user"
	import type { PlayerState } from "$lib/types/playerState"
	import { notifyError, notifySuccess } from "$lib/notifications/notificationEvents"
	import { getPlayerDisplayName } from "$lib/utils/displayNames"
	import { removeWantedPlayer, revertWantedPlayer } from "$lib/utils/wantedActionsApi"
	import { tooltip } from "$lib/utils/tooltip"
	import { playerPunishmentStatus } from "$lib/utils/playerPunishment"
	import { playerStatusNow } from "$lib/stores/playerStatusClock"
	import IconButton from "$lib/components/ui/IconButton.svelte"
	import ListRow from "$lib/components/ui/ListRow.svelte"
	import StatChip from "$lib/components/ui/StatChip.svelte"
	import Tag from "$lib/components/ui/Tag.svelte"
	import PlayerOnlineIndicator from "./PlayerOnlineIndicator.svelte"
	import { createPlayerInfinityMenu } from "./playerInfinityMenu"
	import { openInfinityMenu } from "../ui/infinityMenu"
	import { createContextMenuRequest, createEllipsisMenuRequest } from "./playerMenuRequests"
	import { canRunWantedRowMutation, createWantedRowMenuContext } from "./wantedPlayerRow"
	import { gameProcessAvailable } from "$lib/stores/gameProcessAvailabilityStore"

	export let player: PlayerState
	export let wanted: WantedPlayerListItem["wanted"]
	export let banCount = 0
	export let noteCount = 0
	export let onSelect: (player: PlayerState) => void
	export let onOpenProfile: (player: PlayerState) => void
	export let onMutated: () => void = () => {}

	let alive = true
	let mutationRevision = 0
	let mutationPending = false
	let activeUser = $authState.user
	let rowContext = ""

	$: playerName = getPlayerDisplayName(player.name)
	$: punishment = playerPunishmentStatus(player, $playerStatusNow)
	$: if ($authState.user !== activeUser) {
		activeUser = $authState.user
		mutationRevision += 1
		mutationPending = false
	}
	$: nextRowContext = `${player.dbId ?? 0}:${wanted.originalActionId ?? 0}:${wanted.actionType ?? `legacy`}`
	$: if (nextRowContext !== rowContext) {
		rowContext = nextRowContext
		mutationRevision += 1
		mutationPending = false
	}

	onDestroy(() => {
		alive = false
		mutationRevision += 1
	})

	function openContextMenu(event: MouseEvent): void {
		const request = createContextMenuRequest(event)
		openInfinityMenu(createPlayerInfinityMenu(playerMenuTarget(), playerMenuDependencies()), request.position, request.owner)
	}

	function openEllipsisMenu(event: MouseEvent): void {
		const request = createEllipsisMenuRequest(event)
		if (!request) return
		openInfinityMenu(createPlayerInfinityMenu(playerMenuTarget(), playerMenuDependencies()), request.position, request.owner)
	}

	function playerMenuTarget() {
		return {
			playerId: player.dbId as number,
			name: playerName,
			playfabId: player.playfabId,
			onOpen: () => onSelect(player),
		}
	}

	function playerMenuDependencies() {
		if (!activeUser) return { commandsBlocked: $consoleSetup.commandsBlocked, commandIssue: $consoleSetup.commandIssue, gameAvailable: $gameProcessAvailable }
		return {
			commandsBlocked: $consoleSetup.commandsBlocked, commandIssue: $consoleSetup.commandIssue, gameAvailable: $gameProcessAvailable,
			wanted: createWantedRowMenuContext(wanted, activeUser, {
				onOpenWanted: () => onSelect(player),
				onOpenProfile: () => onOpenProfile(player),
				onRevert: sourceActionId => runMutation(`revert`, sourceActionId),
				onRemove: () => runMutation(`remove`, wanted.originalActionId),
			}),
		}
	}

	async function runMutation(kind: `revert` | `remove`, sourceActionId: number | null): Promise<void> {
		const playerId = player.dbId
		if (!canRunWantedRowMutation(kind, playerId, sourceActionId) || !activeUser || mutationPending) return
		const prompt = kind === `revert`
			? `Revert the global ban for ${playerName}?`
			: `Remove ${playerName} from Wanted?`
		if (!window.confirm(prompt)) return

		const user = activeUser
		const context = rowContext
		const revision = ++mutationRevision
		mutationPending = true
		const current = () => alive
			&& revision === mutationRevision
			&& context === rowContext
			&& user === activeUser

		try {
			if (kind === `revert`) await revertWantedPlayer(playerId!, sourceActionId!)
			else await removeWantedPlayer(playerId!)
			if (!current()) return
			notifySuccess(kind === `revert` ? `Global ban reverted.` : `Player removed from Wanted.`)
			onMutated()
		} catch (error) {
			if (current()) notifyError(error instanceof Error ? error.message : `Wanted action failed.`)
		} finally {
			if (current()) mutationPending = false
		}
	}
</script>

<ListRow
	title={playerName}
	subtitle={player.playfabId}
	outlineTone={punishment.outlineTone}
	tooltip={punishment.tooltip}
	onClick={() => onSelect(player)}
	onContextMenu={openContextMenu}
>
	<svelte:fragment slot="titleTrailing">
		{#if wanted.actionType === `mock`}
			<Tag label="Mock" tooltip="Test entry: only sends the configured server announcement; no player is banned." />
		{/if}
		{#if player.isOnline}
			<PlayerOnlineIndicator playfabId={player.playfabId} />
		{/if}
	</svelte:fragment>

	<svelte:fragment slot="trailing">
		{#if wanted.actionType === `ban`}
			<span use:tooltip={`This community ban has reached ${wanted.completedServerCount} ${wanted.completedServerCount === 1 ? `server` : `servers`}, including the originating server when applicable.`}>
				<StatChip icon="fa-globe" label="Community bans" value={wanted.completedServerCount.toString()} />
			</span>
		{:else if wanted.actionType === `mock`}
			<span use:tooltip={`${wanted.completedServerCount} completed mock announcements. Mock runs do not ban the player.`}>
				<StatChip icon="fa-flask" label="Mock runs" value={wanted.completedServerCount.toString()} />
			</span>
		{:else if wanted.actionType === `unban`}
			<span use:tooltip={`Servers where this community ban has been reverted, out of the targeted servers.`}>
				<StatChip icon="fa-rotate-left" label="Reverted" value={`${wanted.completedServerCount}/${wanted.targetServerCount ?? 0}`} />
			</span>
		{/if}
		<span use:tooltip={`${banCount} total ban records in this player's history, including community bans. This is not the number of currently banned servers.`}>
			<StatChip icon="fa-ban" label="Total bans" value={banCount.toString()} showLabel={false} />
		</span>
		<span use:tooltip={`${noteCount} ${noteCount === 1 ? "note" : "notes"}`}>
			<StatChip icon="fa-note-sticky" label="Notes" value={noteCount.toString()} showLabel={false} />
		</span>

		<IconButton
			icon="fa-ellipsis"
			ariaLabel={`Actions for ${playerName}`}
			sfx={null}
			onClick={openEllipsisMenu}
		/>
	</svelte:fragment>
</ListRow>
