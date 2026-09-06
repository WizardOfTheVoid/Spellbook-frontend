<script lang="ts">
	import { onDestroy } from "svelte"
	import type { WantedPlayerListItem } from "$lib/core"
	import { authState } from "$lib/auth/user"
	import type { PlayerState } from "$lib/types/playerState"
	import { notifyError, notifySuccess } from "$lib/notifications/notificationEvents"
	import { getPlayerDisplayName } from "$lib/utils/displayNames"
	import { removeWantedPlayer, revertWantedPlayer } from "$lib/utils/wantedActionsApi"
	import { tooltip } from "$lib/utils/tooltip"
	import IconButton from "$lib/components/ui/IconButton.svelte"
	import ListRow from "$lib/components/ui/ListRow.svelte"
	import StatChip from "$lib/components/ui/StatChip.svelte"
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
		if (!activeUser) return { gameAvailable: $gameProcessAvailable }
		return {
			gameAvailable: $gameProcessAvailable,
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
	outlineTone={wanted.offenseType === "hacker" ? "danger" : null}
	onClick={() => onSelect(player)}
	onContextMenu={openContextMenu}
>
	<svelte:fragment slot="titleTrailing">
		{#if player.isOnline}
			<PlayerOnlineIndicator />
		{/if}
	</svelte:fragment>

	<svelte:fragment slot="trailing">
		<span use:tooltip={`${banCount} ${banCount === 1 ? "ban" : "bans"}`}>
			<StatChip icon="fa-ban" label="Bans" value={banCount.toString()} showLabel={false} />
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
