<script lang="ts">
	import type { PlayerAction } from "$lib/core"
	import type { FormOption } from "$lib/types/ui"
	import {
		actionLabel,
		formatActionDuration,
		formatActionTooltip,
	} from "$lib/utils/playerActions"
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte"
	import Select from "$lib/components/ui/Select.svelte"
	import Tag from "$lib/components/ui/Tag.svelte"
	import { openPlayerActionInfinityMenu } from "./playerActionInfinityMenu"
	import { gameProcessAvailable } from "$lib/stores/gameProcessAvailabilityStore"

	const ACTION_RANGE_OPTIONS: FormOption[] = [
		{ value: "30", label: "Last 30 days" },
		{ value: "90", label: "Last 90 days" },
		{ value: "all", label: "All time" },
	]

	export let actions: PlayerAction[]
	export let limit = 8
	export let range = "30"
	export let onRangeChange: ((range: string) => void) | null = null
	export let onSelect: ((action: PlayerAction) => void) | null = null
	export let onUnban: ((action: PlayerAction) => void | Promise<void>) | null = null
	export let onOpenNotes: (() => void) | null = null
	export let noteCount = 0

	function label(action: PlayerAction): string {
		const duration = action.actionType === "ban" ? ` · ${formatActionDuration(action)}` : ""
		return `${actionLabel(action)}${duration}`
	}
</script>

<section class="actions-section" aria-label="Player actions">
	<PanelHeader
		variant="section"
		title="Player actions"
		help="Recorded bans, warnings, kicks, mutes, and unbans for this player."
	>
		<svelte:fragment slot="trailing">
			<Select
				label="Action range"
				showLabel={false}
				options={ACTION_RANGE_OPTIONS}
				value={range}
				onChange={(next) => onRangeChange?.(next)}
			/>
		</svelte:fragment>
	</PanelHeader>

	<div class="actions-section__tags">
		{#each actions.slice(0, limit) as action (action.id)}
			<Tag
				label={label(action)}
				icon={action.actionType === "ban" ? "fa-ban" : action.actionType === "unban" ? "fa-unlock" : "fa-flag"}
				tooltip={formatActionTooltip(action)}
				onClick={() => onSelect?.(action)}
				onContextMenu={(event) => openPlayerActionInfinityMenu(event, action, actions, {
					onUnban: onUnban ?? undefined,
					gameAvailable: $gameProcessAvailable,
					onOpenNotes: onOpenNotes ? () => onOpenNotes?.() : undefined,
					noteCount,
				})}
			/>
		{:else}
			<Tag label="No recorded actions" icon="fa-circle-check" />
		{/each}
	</div>
</section>

<style lang="scss">
	.actions-section {
		display: grid;
		gap: var(--gutter-md);
	}

	.actions-section__tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gutter-sm);
	}
</style>
