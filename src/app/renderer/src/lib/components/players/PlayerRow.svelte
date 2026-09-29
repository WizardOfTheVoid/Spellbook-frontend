<script lang="ts">
	import { consoleSetup } from "$lib/consoleSetup/consoleSetupStore";
	import type { PlayerState } from "$lib/types/playerState";
	import { getPlayerRowDisplayName } from "$lib/utils/displayNames";
	import { shouldShowPlayerOnlineIndicator } from "$lib/utils/playerUtils";
	import { playerPunishmentStatus } from "$lib/utils/playerPunishment";
	import { playerStatusNow } from "$lib/stores/playerStatusClock";
	import { createPlayerRowStats } from "$lib/utils/playerRowStats";
	import ListRow from "$lib/components/ui/ListRow.svelte";
	import IconButton from "$lib/components/ui/IconButton.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";
	import { tooltip } from "$lib/utils/tooltip";
	import { playerNameHighlight } from "$lib/utils/playerNameHighlight";
	import StatChip from "$lib/components/ui/StatChip.svelte";
	import PlayerOnlineIndicator from "./PlayerOnlineIndicator.svelte";
	import PlayerWantedIndicator from "./playerWantedIndicator.svelte";
	import { openPlayerInfinityMenu } from "./playerInfinityMenu";
	import { gameProcessAvailable } from "$lib/stores/gameProcessAvailabilityStore";
	import { hasKnownPlayfabId } from '@spellbook/shared/playerIdentity'
	import {
		createContextMenuRequest,
		createEllipsisMenuRequest,
	} from "./playerMenuRequests";
	import { evidencePlayerSelection, requestEvidenceNavigation } from './evidence/navigation'

	export let player: PlayerState;
	export let mode: "database" | "live";
	export let onSelect: (player: PlayerState) => void = () => {}
	export let readOnly = false
	export let search = ``;
	export let gameServerId: number | undefined = undefined;
	export let showEvidenceCount = false
	export let onViewEvidence: (() => void) | null = null

	$: playerName = getPlayerRowDisplayName(player);
	$: identified = hasKnownPlayfabId(player.playfabId)
	$: displayedNameLength =
		[...playerName].length + [...(player.dbPlayer?.matchedAlias ?? ``)].length;
	$: nameHighlight = playerNameHighlight(playerName, search);
	$: aliasHighlight = playerNameHighlight(
		player.dbPlayer?.matchedAlias ?? ``,
		search,
	);
	$: stats = createPlayerRowStats(player, mode);
	$: punishment = playerPunishmentStatus(
		{ ...player, isWanted: player.dbPlayer?.isWanted },
		$playerStatusNow,
	);

	function openContextMenu(event: MouseEvent): void {
		if (readOnly || !identified) return
		const request = createContextMenuRequest(event);
		openPlayerInfinityMenu(
			request.position,
			request.owner,
			playerMenuTarget(),
			() => SFX.play(`open`),
			{
				commandsBlocked: $consoleSetup.commandsBlocked,
				commandIssue: $consoleSetup.commandIssue,
				gameAvailable: $gameProcessAvailable,
			},
		);
	}

	function openEllipsisMenu(event: MouseEvent): void {
		if (readOnly || !identified) return
		const request = createEllipsisMenuRequest(event);
		if (!request) return;
		openPlayerInfinityMenu(
			request.position,
			request.owner,
			playerMenuTarget(),
			() => SFX.play(`open`),
			{
				commandsBlocked: $consoleSetup.commandsBlocked,
				commandIssue: $consoleSetup.commandIssue,
				gameAvailable: $gameProcessAvailable,
			},
		);
	}

	function playerMenuTarget() {
		return {
			playerId: player.dbId as number,
			gameServerId,
			name: playerName,
			playfabId: player.playfabId,
			onOpen: () => onSelect(player),
			evidenceCount: player.dbPlayer?.evidenceCount ?? 0,
			onAddEvidence: () => requestEvidenceNavigation(`add`, evidencePlayerSelection(player)),
			onViewEvidence: onViewEvidence ?? (() => requestEvidenceNavigation(`view`, evidencePlayerSelection(player))),
		};
	}
</script>

<div
	class={`player-row${punishment.state ? ` player-row--${punishment.state}` : ``}`}
>
	<ListRow
		title={playerName}
		subtitle={identified ? player.playfabId : `PlayFab ID unavailable`}
		tooltip={punishment.tooltip}
		onClick={identified && !readOnly ? () => onSelect(player) : null}
		onContextMenu={identified && !readOnly ? openContextMenu : null}
	>
		<svelte:fragment slot="title">
			<span
				class="username"
				class:username--long={displayedNameLength > 16 &&
					displayedNameLength <= 24}
				class:username--very-long={displayedNameLength > 24}
			>
				{nameHighlight.before}{#if nameHighlight.match}
					<span class="player-name-match">{nameHighlight.match}</span>
				{/if}{nameHighlight.after}
			</span>
		</svelte:fragment>
		<svelte:fragment slot="titleTrailing">
			{#if player.dbPlayer?.isWanted}
				<PlayerWantedIndicator />
			{/if}
			{#if player.dbPlayer?.matchedAlias}
				<span
					class="matched-alias"
					use:tooltip={`Matched alias: ${player.dbPlayer.matchedAlias}`}
				>
					<Icon name="fa-clock-rotate-left" size="xs" />
					<span class="matched-alias__name">
						{aliasHighlight.before}{#if aliasHighlight.match}
							<span class="player-name-match">{aliasHighlight.match}</span>
						{/if}{aliasHighlight.after}
					</span>
				</span>
			{/if}

			{#if shouldShowPlayerOnlineIndicator(player, mode)}
				<PlayerOnlineIndicator playfabId={player.playfabId} />
			{/if}
		</svelte:fragment>

		<svelte:fragment slot="trailing">
			{#if showEvidenceCount}<StatChip icon="fa-photo-film" label="Evidence" value={`${player.dbPlayer?.evidenceCount ?? 0}`} showLabel={false} />{/if}
			{#each stats as stat (stat.id)}
				<StatChip
					icon={stat.icon}
					label={stat.label}
					value={stat.value}
					iconColor={stat.iconColor}
					showLabel={false}
				/>
			{/each}

			{#if identified && !readOnly}
				<IconButton
					icon="fa-ellipsis-vertical"
					ariaLabel={`Actions for ${playerName}`}
					sfx={null}
					onClick={openEllipsisMenu}
				/>
			{/if}
		</svelte:fragment>
	</ListRow>
</div>

<style lang="scss">
	.player-row {
		--player-row-border: var(--color-dark-secondary);
		--player-row-background: transparent;
		--player-row-border-style: solid;
	}

	.player-row :global(.list-row) {
		border-color: var(--player-row-border);
		border-style: var(--player-row-border-style, solid);
		background-color: var(--player-row-background);
	}

	// .player-row--offense {
	// --player-row-border: #{rgbaa(var(--color-accent-tertiary), 0.5)};
	// }

	.player-row--kick {
		--player-row-border: #{rgbaa(var(--color-accent-tertiary), 0.5)};
	}

	.player-row--ban {
		--player-row-border: #{rgbaa(var(--color-accent-tertiary), 1)};
	}

	.player-row--lowLevelBan {
		--player-row-border: #{rgbaa(var(--color-accent-tertiary), 0.5)};
	}

	.player-row--otherBan {
		--player-row-border: #{rgbaa(var(--color-danger), 0.5)};
	}

	.player-row--cheatingBan {
		--player-row-border: var(--color-danger);
	}

	.player-row--wanted {
		--player-row-border: var(--color-danger);
		--player-row-background: #{rgbaa(var(--color-danger), 0.05)};
	}

	.username {
		font-size: var(--font-size-lg);
	}

	.username--long {
		font-size: var(--font-size-md);
	}

	.username--very-long {
		font-size: var(--font-size-xs);
	}

	.matched-alias {
		display: inline-flex;
		align-items: center;
		gap: calc(var(--gutter-sm) / 2);
		min-width: 0;
		color: var(--color-light-tertiary);
		font-size: var(--font-size-sm);
		white-space: nowrap;
	}

	.matched-alias__name {
		overflow: hidden;
		text-overflow: ellipsis;
		font-size: var(--font-size-xs);
	}

	.player-name-match {
		position: relative;
		background-color: rgbaa(var(--color-light-tertiary), 0.25);
		padding: 4px 1.5px;
		border-radius: 6px;
		display: inline-block;
		z-index: 1;
	}
</style>
