<script lang="ts">
	import type { ControlSize, Tone } from "$lib/types/tone";
	import type { CueName } from "uisfx";
	import { tooltip as tooltipAction } from "$lib/utils/tooltip";
	import Icon from "./Icon.svelte";
	import BadgeBubble from "./badgeBubble.svelte"

	export let icon: string;
	export let element: HTMLButtonElement | undefined = undefined
	export let ariaLabel: string;
	export let tone: Tone = "default";
	export let size: ControlSize = "md";
	export let iconSize: `xs` | `sm` | `md` | `lg` | `xlg` | `xxl` = `md`
	export let shape: "round" | "rounded" = "rounded";
	export let position: "absolute" | "static" = "static";
	export let disabled = false;
	export let expanded: boolean | null = null;
	export let controls: string | null = null;
	export let hasPopup: "menu" | "dialog" | "listbox" | null = "menu";
	export let tooltip: string | null = null;
	export let badge: number | null = null;
	export let accentColor: string | null = null
	export let active = false;
	export let sfx: CueName | null = "press";
	export let stopPropagation = false;
	export let navigationBack = false
	export let onClick: ((event: MouseEvent) => void) | null = null;
</script>

<button
	bind:this={element}
	class={`icon-button icon-button--${size} icon-button--${shape} icon-button--${position}`}
	class:icon-button--active={active}
	class:icon-button--accent={accentColor !== null}
	style={`--icon-button-accent: ${accentColor ?? `var(--color-accent-primary)`}`}
	type="button"
	aria-label={ariaLabel}
	aria-expanded={expanded ?? undefined}
	aria-controls={controls ?? undefined}
	aria-haspopup={expanded === null || hasPopup === null ? undefined : hasPopup}
	use:tooltipAction={tooltip ?? ""}
	data-uisfx={sfx ?? undefined}
	data-navigation-back={navigationBack ? `` : undefined}
	data-uisfx-ignore={sfx === null ? `true` : undefined}
	{disabled}
	on:click={(event) => {
		if (stopPropagation) event.stopPropagation();
		onClick?.(event);
	}}
>
	<Icon name={icon} tone={accentColor ? `var(--color-light-primary)` : tone} size={iconSize} />
	<BadgeBubble count={badge ?? 0} color={accentColor ?? `var(--color-accent-primary)`} floating />
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
		border: 1px solid var(--color-dark-tertiary);

		transition: all var(--motion-slow) var(--motion-ease);

		&:is(:hover, :focus-visible):not(:disabled) {
			border-color: var(--color-light-tertiary);
			transition: all 0 var(--motion-ease);
		}

		&:active:not(:disabled) {
			border-color: var(--color-light-secondary);
			background-color: rgbaa(var(--color-dark-tertiary), 0.15);
		}
	}

	.icon-button--active {
		border-color: var(--icon-button-accent);
		background: rgbaa(var(--icon-button-accent), 0.15);
	}

	.icon-button--active:is(:hover, :focus-visible):not(:disabled) {
		border-color: var(--icon-button-accent);
	}

	.icon-button--accent.icon-button--active {
		background: transparent;
	}

	.icon-button--accent:is(:hover, :focus-visible):not(:disabled) {
		border-color: var(--icon-button-accent);
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
