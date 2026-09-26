<script lang="ts">
	import type { ServerProfileAction } from "$lib/core";
  import type { PlayerAction } from '$lib/core'
  import { profileDuplicateBan } from '@spellbook/shared/playerBans'
  import { playerStatusNow } from '$lib/stores/playerStatusClock'
	import { consoleSetup } from '$lib/consoleSetup/consoleSetupStore'
	import {
		actionDescription,
		profileActionIcon,
		profileActionIconColor,
	} from "$lib/utils/profileActions";
	import ActionRow from "$lib/components/ui/ActionRow.svelte";
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte";
	import TileGrid from "$lib/components/ui/TileGrid.svelte"
	import {
		gameCommandIssue,
		profileActionRequiresGameProcess,
	} from "$lib/utils/gameProcessActions";

	export let title: string;
	export let actions: ServerProfileAction[];
	export let loading = false;
  export let activeBans: PlayerAction[] = []
  export let gameServerId: number | null = null
	export let runningAction: ServerProfileAction | null = null;
	export let disabled = false;
	export let gameAvailable = false;
  export let unbanUsesModal = false
	export let descriptionFallback = "Run this profile action.";
	export let emptyMessage = "This profile has no enabled actions.";
	export let onRun: (action: ServerProfileAction) => void;
</script>

<div
	class="profile-action-list panel-subview"
	aria-label={title}
	aria-busy={loading}
>
	<PanelHeader variant="section" {title} />

	{#if loading}
		<p class="profile-action-list__empty">Loading profile actions...</p>
	{:else if actions.length > 0}
		<TileGrid columns={2}>
			{#each actions as action (action.id ?? action.label)}
				{@const actionIcon = profileActionIcon(action)}
				{@const issue = profileDuplicateBan(action.commands, activeBans, gameServerId, new Date($playerStatusNow)) ?? (unbanUsesModal && action.commands.some(command => command.commandType === `unban`) ? null : gameCommandIssue(gameAvailable || !profileActionRequiresGameProcess(action), $consoleSetup.commandsBlocked, $consoleSetup.commandIssue))}
				<ActionRow
					title={action.label}
					description={actionDescription(action, descriptionFallback)}
					status={runningAction === action ? `Running` : null}
					icon={actionIcon.name}
					iconType={actionIcon.type}
					iconColor={profileActionIconColor(action)}
					disabled={disabled || runningAction !== null || issue !== null}
					tooltip={issue}
					onClick={() => onRun(action)}
				/>
			{/each}
		</TileGrid>
	{:else}
		<p class="profile-action-list__empty">{emptyMessage}</p>
	{/if}
</div>

<style lang="scss">
	.profile-action-list {
		display: grid;
		gap: var(--gutter-md);
	}

	.profile-action-list__empty {
		margin: 0;
		border: 1px dashed var(--color-dark-secondary);
		border-radius: var(--radius-xl);
		padding: var(--gutter-lg);
		color: var(--color-text-secondary);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		text-align: center;
	}
</style>
