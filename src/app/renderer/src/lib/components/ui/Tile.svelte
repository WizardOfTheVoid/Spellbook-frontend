<script lang="ts">
	import type { Tone } from "$lib/types/tone";
	import { tooltip as tooltipAction } from "$lib/utils/tooltip";
	import IconBadge from "./IconBadge.svelte";

	export let badge = 0
	export let title: string;
	export let suffix: string | null = null;
	export let value: string | null = null;
	export let subtitle: string | null = null;
	export let icon: string | null = null;
	export let iconType: "solid" | "regular" | "light" | "thin" | "brands" = "light"
	export let iconTone: Tone = "default";
	export let tone: Tone = "default";
	export let disabled = false;
	export let ariaLabel: string | null = null;
	export let tooltip: string | null = null;
	export let onClick: (() => void) | null = null;
</script>

{#if onClick}
	<button
		class={`ui-tile ui-tile--${tone} ui-tile--button`}
		type="button"
		aria-label={ariaLabel ?? title}
		use:tooltipAction={tooltip ?? ""}
		data-uisfx="select"
		{disabled}
		on:click={() => !disabled && onClick?.()}
	>
		{#if icon}
			<IconBadge name={icon} tone={iconTone} {iconType} />
		{/if}
		<span class="ui-tile__copy">
			<strong>{title}{#if suffix} <span class="ui-tile__suffix">{suffix}</span>{/if}</strong>
			{#if subtitle}<span>{subtitle}</span>{/if}
		</span>
		{#if badge > 0}<span class="ui-tile__badge" aria-label={`${badge} pending requests`}>{badge}</span>{/if}
		{#if value}<b class="ui-tile__value">{value}</b>{/if}
	</button>
{:else}
	<div class={`ui-tile ui-tile--${tone}`} use:tooltipAction={tooltip ?? ""}>
		{#if icon}
			<IconBadge name={icon} tone={iconTone} {iconType} />
		{/if}
		<span class="ui-tile__copy">
			<strong>{title}{#if suffix} <span class="ui-tile__suffix">{suffix}</span>{/if}</strong>
			{#if subtitle}<span>{subtitle}</span>{/if}
		</span>
		{#if badge > 0}<span class="ui-tile__badge" aria-label={`${badge} pending requests`}>{badge}</span>{/if}
		{#if value}<b class="ui-tile__value">{value}</b>{/if}
	</div>
{/if}

<style lang="scss">
	.ui-tile__badge { position: absolute; top: -5px; right: -5px; min-width: 20px; height: 20px; display: grid; place-items: center; padding: 0 5px; border: 2px solid var(--color-dark-primary); border-radius: 999px; background: rgb(220 38 38); color: var(--white); font-size: var(--font-size-xs); }
	.ui-tile {
		position: relative;
		min-width: 0;
		min-height: 68px;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: var(--gutter-md);
		border-radius: var(--radius);
		padding: var(--gutter-md) var(--gutter-md);
		text-align: left;
		user-select: none;

		color: var(--color-light-primary);
		background: transparent;
		border: 1px solid var(--color-dark-secondary);
	}

	button.ui-tile {
		transition: all var(--motion-fast) var(--motion-ease);

		&:hover {
			background-color: rgbaa(var(--color-dark-secondary), 0.05);
			color: var(--color-light-primary);
			transition: all 0ms;
		}

		&:active {
			background-color: rgbaa(var(--color-dark-secondary), 0.05);
			border-color: rgbaa(var(--color-light-secondary), 0.25);
		}
	}

	.ui-tile--button {
		cursor: pointer;
	}

	.ui-tile__copy {
		min-width: 0;
		display: grid;
		gap: var(--gutter-sm);
	}

	.ui-tile__copy strong {
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight);
		color: var(--color-light-primary);
	}

	.ui-tile__suffix {
		margin-inline-start: 0.25em;
		color: var(--color-light-tertiary);
	}

	.ui-tile__copy span {
		overflow: hidden;
		color: var(--color-light-tertiary);
		font-size: var(--font-size-md);
		font-weight: var(--font-weight);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ui-tile__value {
		color: var(--color-accent-tertiary);
		font-size: var(--font-size-md);
	}

	.ui-tile--success {
		border-color: var(--color-accent-secondary);
	}

	.ui-tile--danger {
		border-color: var(--color-accent-quaternary);
	}

	.ui-tile--warning {
		border-color: var(--color-accent-tertiary);
	}
</style>
