<script lang="ts">
	import type { ControlSize, Tone } from "$lib/types/tone";
	import type { CueName } from "uisfx";
	import { tooltip as tooltipAction } from "$lib/utils/tooltip";
	import Icon from "./Icon.svelte";

	export let icon: string;
	export let ariaLabel: string;
	export let tone: Tone = "default";
	export let size: ControlSize = "md";
	export let shape: "round" | "rounded" = "rounded";
	export let position: "absolute" | "static" = "static";
	export let disabled = false;
	export let expanded: boolean | null = null;
	export let controls: string | null = null;
	export let hasPopup: "menu" | "dialog" | "listbox" | null = "menu";
	export let tooltip: string | null = null;
	export let badge: number | null = null;
	export let active = false;
	export let sfx: CueName | null = "press";
	export let stopPropagation = false;
	export let onClick: ((event: MouseEvent) => void) | null = null;
</script>

<button
	class={`icon-button icon-button--${size} icon-button--${shape} icon-button--${position}`}
	class:icon-button--active={active}
	type="button"
	aria-label={ariaLabel}
	aria-expanded={expanded ?? undefined}
	aria-controls={controls ?? undefined}
	aria-haspopup={expanded === null || hasPopup === null ? undefined : hasPopup}
	use:tooltipAction={tooltip ?? ""}
	data-uisfx={sfx ?? undefined}
	data-uisfx-ignore={sfx === null ? `true` : undefined}
	{disabled}
	on:click={(event) => {
		if (stopPropagation) event.stopPropagation();
		onClick?.(event);
	}}
>
	<Icon name={icon} {tone} size="md" />
	{#if badge !== null && badge > 0}
		<span class="icon-button__badge" aria-hidden="true">{badge}</span>
	{/if}
</button>

<style lang="scss">
	.icon-button {
		position: relative;
		display: inline-grid;
		place-items: center;
		text-align: center;
		flex: 0 0 auto;
		padding: 0;

		cursor: pointer;
		border: 1px solid transparent;

		transition: all var(--motion-slow) var(--motion-ease);

		&:hover {
			border-color: rgbaa(var(--color-dark-tertiary), 1);
			transform: scale(1.05);
			transition: all 0 var(--motion-ease);
		}

		&:active {
			background-color: rgbaa(var(--color-dark-tertiary), 0.15);
		}
	}

	.icon-button--active {
		border-color: var(--color-accent-primary);
		background: rgbaa(var(--color-accent-primary), 0.15);
	}

	.icon-button__badge {
		position: absolute;
		top: -4px;
		right: -4px;
		min-width: 16px;
		height: 16px;
		display: grid;
		place-items: center;
		border: 1px solid var(--color-dark-primary);
		border-radius: 50%;
		padding: 0 3px;
		color: var(--color-dark-primary);
		background: var(--color-accent-primary);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		line-height: 1;
	}

	.icon-button--absolute {
		position: absolute;
		right: var(--gutter-md);
	}

	.icon-button--sm {
		width: var(--control-height-sm);
		height: var(--control-height-sm);
	}

	.icon-button--md {
		width: var(--control-height-md);
		height: var(--control-height-md);
	}

	.icon-button--lg {
		width: var(--control-height-lg);
		height: var(--control-height-lg);
	}

	.icon-button--rounded {
		border-radius: var(--radius);
	}

	.icon-button--round {
		border-radius: 99999px;
	}
</style>
