<script lang="ts">
	import type { FilterChip } from "$lib/types/ui";
	import Tag from "./Tag.svelte";

	export let chips: FilterChip[];
	export let selected: string[] = [];
	export let onToggle: (id: string) => void;
	export let onReset: (() => void) | null = null
	export let resetTooltip = "Clear search and all filters.";
</script>

<div class="filter-chip-row" role="group" aria-label="Filters">
	{#if onReset}
		<Tag
			label="Reset"
			icon="fa-rotate-left"
			tooltip={resetTooltip}
			onClick={onReset}
		/>
		<span class="filter-chip-row__separator" aria-hidden="true">|</span>
	{/if}

	{#each chips as chip (chip.id)}
		<Tag
			label={chip.label}
			icon={chip.icon ?? null}
			tooltip={chip.tooltip ?? null}
			disabled={chip.disabled ?? false}
			selected={selected.includes(chip.id)}
			onClick={() => onToggle(chip.id)}
		/>
	{/each}
</div>

<style lang="scss">
	.filter-chip-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gutter-sm);
	}

	.filter-chip-row__separator {
		color: var(--color-light-tertiary);
		opacity: 0.5;
	}
</style>
