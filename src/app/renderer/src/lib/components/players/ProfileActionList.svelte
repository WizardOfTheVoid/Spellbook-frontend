<script lang="ts">
	import type { ServerProfileAction } from "$lib/core";
	import {
		actionCommandCount,
		actionCommandSummary,
		actionDescription,
		profileActionIcon,
		profileActionIconColor,
	} from "$lib/utils/profileActions";
	import ActionRow from "$lib/components/ui/ActionRow.svelte";
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte";
	import {
		GAME_PROCESS_REQUIRED_TOOLTIP,
		profileActionRequiresGameProcess,
	} from "$lib/utils/gameProcessActions";

	export let title: string;
	export let actions: ServerProfileAction[];
	export let loading = false;
	export let runningAction: ServerProfileAction | null = null;
	export let disabled = false;
	export let gameAvailable = false;
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
	{:else}
		{#each actions as action (action.id ?? action.label)}
			{@const actionIcon = profileActionIcon(action)}
			{@const unavailable = !gameAvailable && profileActionRequiresGameProcess(action)}
			<ActionRow
				title={action.label}
				description={actionDescription(action, descriptionFallback)}
				meta={actionCommandSummary(action)}
				status={runningAction === action ? "Running" : (
					actionCommandCount(action)
				)}
				icon={actionIcon.name}
				iconType={actionIcon.type}
				iconColor={profileActionIconColor(action)}
				disabled={disabled || runningAction !== null || unavailable}
				tooltip={unavailable ? GAME_PROCESS_REQUIRED_TOOLTIP : null}
				onClick={() => onRun(action)}
			/>
		{:else}
			<p class="profile-action-list__empty">{emptyMessage}</p>
		{/each}
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
