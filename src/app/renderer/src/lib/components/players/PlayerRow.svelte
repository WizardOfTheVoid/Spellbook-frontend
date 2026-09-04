<script lang="ts">
	import type { PlayerState } from "$lib/types/playerState";
	import { getPlayerRowDisplayName } from "$lib/utils/displayNames";
	import { playerBanOutlineTone, shouldShowPlayerOnlineIndicator } from "$lib/utils/playerUtils";
	import { createPlayerRowStats } from "$lib/utils/playerRowStats";
	import ListRow from "$lib/components/ui/ListRow.svelte";
	import IconButton from "$lib/components/ui/IconButton.svelte";
	import StatChip from "$lib/components/ui/StatChip.svelte";
	import PlayerOnlineIndicator from "./PlayerOnlineIndicator.svelte";
	import { openPlayerInfinityMenu } from "./playerInfinityMenu";
	import { gameProcessAvailable } from "$lib/stores/gameProcessAvailabilityStore";
	import {
		createContextMenuRequest,
		createEllipsisMenuRequest,
	} from "./playerMenuRequests";

	export let player: PlayerState;
	export let mode: "database" | "live";
	export let onSelect: (player: PlayerState) => void;

	$: playerName = getPlayerRowDisplayName(player);
	$: stats = createPlayerRowStats(player, mode);

	function openContextMenu(event: MouseEvent): void {
		const request = createContextMenuRequest(event);
		openPlayerInfinityMenu(request.position, request.owner, playerMenuTarget(), () => SFX.play(`open`), {
			gameAvailable: $gameProcessAvailable,
		});
	}

	function openEllipsisMenu(event: MouseEvent): void {
		const request = createEllipsisMenuRequest(event);
		if (!request) return;
		openPlayerInfinityMenu(request.position, request.owner, playerMenuTarget(), () => SFX.play(`open`), {
			gameAvailable: $gameProcessAvailable,
		});
	}

	function playerMenuTarget() {
		return {
			playerId: player.dbId as number,
			name: playerName,
			playfabId: player.playfabId,
			onOpen: () => onSelect(player),
		};
	}
</script>

<ListRow
	title={playerName}
	subtitle={player.playfabId}
	outlineTone={playerBanOutlineTone(player.activeBanKind)}
	onClick={() => onSelect(player)}
	onContextMenu={openContextMenu}
>
	<svelte:fragment slot="titleTrailing">
		{#if shouldShowPlayerOnlineIndicator(player, mode)}
			<PlayerOnlineIndicator />
		{/if}
	</svelte:fragment>

	<svelte:fragment slot="trailing">
		{#each stats as stat (stat.id)}
			<StatChip
				icon={stat.icon}
				label={stat.label}
				value={stat.value}
				iconColor={stat.iconColor}
				showLabel={false}
			/>
		{/each}

		<IconButton
			icon="fa-ellipsis-vertical"
			ariaLabel={`Actions for ${playerName}`}
			sfx={null}
			onClick={openEllipsisMenu}
		/>
	</svelte:fragment>
</ListRow>
