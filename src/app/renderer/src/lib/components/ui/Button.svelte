<script lang="ts">
	import type { ControlSize } from "$lib/types/tone";
	import type { CueName } from "uisfx";
	import { tooltip as tooltipAction } from "$lib/utils/tooltip";
	import Icon from "./Icon.svelte";

	export let label: string;
	export let suffix: string | null = null;
	export let icon: string | null = null;
	export let variant: "primary" | "ghost" | "danger" = "ghost";
	export let size: ControlSize = "md";
	export let disabled = false;
	export let title: string | null = null;
	export let tooltip: string | null = null;
	export let sfx: CueName | null = "press";
	export let onClick: (() => void) | null = null;
</script>

<button
	class={`ui-button ui-button--${variant} ui-button--${size}`}
	type="button"
	title={title ?? undefined}
	use:tooltipAction={tooltip ?? ""}
	data-uisfx={sfx ?? undefined}
	{disabled}
	on:click={() => onClick?.()}
>
	{#if icon}
		<Icon name={icon} size="md" />
	{/if}
	<span>{label}</span>
	{#if suffix}<span class="ui-button__suffix">{suffix}</span>{/if}
</button>

<style lang="scss">
	.ui-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--gutter-sm);
		border-radius: var(--radius);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
	}

	.ui-button--sm {
		min-height: var(--control-height-sm);
		padding: 0 var(--gutter-md);
	}

	.ui-button--md {
		min-height: var(--control-height-md);
		padding: 0 var(--gutter-md);
	}

	.ui-button--lg {
		min-height: var(--control-height-lg);
		padding: 0 var(--gutter-lg);
	}

	.ui-button--primary {
		border-color: var(--color-dark-secondary);
		color: var(--color-accent-tertiary);
	}

	.ui-button--danger {
		border-color: var(--color-dark-secondary);
		color: var(--color-accent-tertiary);
	}

	.ui-button__suffix { color: var(--color-light-tertiary); }
</style>
