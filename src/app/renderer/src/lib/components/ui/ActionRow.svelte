<script lang="ts">
	import type { Tone } from "$lib/types/tone";
	import { tooltip as tooltipAction } from "$lib/utils/tooltip";
	import IconBadge from "./IconBadge.svelte";

	export let title: string;
	export let description: string | null = null;
	export let meta: string | null = null;
	export let status: string | null = null;
	export let icon = "fa-bolt";
	export let iconTone: Tone = "accent";
	export let iconType: "solid" | "regular" | "light" | "thin" | "brands" = "light"
	export let iconColor: string | null = null
	export let disabled = false;
	export let tooltip: string | null = null;
	export let onClick: (() => void) | null = null;
</script>

<button
	class="action-row"
	type="button"
	data-uisfx="press"
	use:tooltipAction={tooltip ?? ""}
	{disabled}
	on:click={() => onClick?.()}
>
	<IconBadge name={icon} tone={iconTone} {iconType} {iconColor} />
	<span class="action-row__copy">
		<strong>{title}</strong>
		{#if description}<span>{description}</span>{/if}
		{#if meta}<small>{meta}</small>{/if}
	</span>
	{#if status}<span class="action-row__status">{status}</span>{/if}
</button>

<style lang="scss">
	.action-row {
		min-height: 92px;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--gutter-md);
		border-radius: var(--radius);
		padding: var(--gutter-md);
		text-align: left;
	}

	.action-row__copy {
		min-width: 0;
		display: grid;
		gap: var(--gutter-sm);
	}

	.action-row__copy strong {
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-medium);
	}

	.action-row__copy span {
		color: var(--color-text-secondary);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
	}

	.action-row__copy small {
		color: var(--color-light-tertiary);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
	}

	.action-row__status {
		color: var(--color-accent-tertiary);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		text-align: right;
		text-transform: uppercase;
	}
</style>
