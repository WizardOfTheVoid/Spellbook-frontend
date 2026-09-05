<script lang="ts">
	// import type { Tone } from "$lib/types/tone";
	// import { toneStyle } from "$lib/utils/tones";
	import type { CueName } from "uisfx"
	import { tooltip as tooltipAction } from "$lib/utils/tooltip";
	import Icon from "./Icon.svelte";

	export let label: string;
	export let suffix: string | null = null;
	export let icon: string | null = null;
	export let count: number | null = null;
	// export let tone: Tone = "muted";
	export let selected = false;
	export let disabled = false;
	export let tooltip: string | null = null;
	export let sfx: CueName | null | undefined = undefined
	export let onClick: ((event: MouseEvent) => void) | null = null;
	export let onContextMenu: ((event: MouseEvent) => void) | null = null;

	$: sfxCue = sfx === undefined ? (selected ? `deselect` : `select`) : sfx
</script>

{#if onClick || onContextMenu}
	<button
		class="ui-tag ui-tag--interactive"
		class:ui-tag--selected={selected}
		type="button"
		aria-pressed={selected}
		data-uisfx={sfxCue ?? undefined}
		data-uisfx-ignore={sfxCue === null ? `true` : undefined}
		{disabled}
		use:tooltipAction={tooltip ?? ""}
		on:click={(event) => onClick?.(event)}
		on:contextmenu={(event) => onContextMenu?.(event)}
	>
		{#if icon}
			<Icon name={icon} size="lg" type="light" />
		{/if}
		<span class="ui-tag__label">{label}</span>
		{#if suffix}<span class="ui-tag__suffix">{suffix}</span>{/if}
		{#if count !== null}
			<b class="ui-tag__count">x{count}</b>
		{/if}
	</button>
{:else}
	<span
		class="ui-tag"
		class:ui-tag--selected={selected}
		use:tooltipAction={tooltip ?? ""}
	>
		{#if icon}
			<Icon name={icon} size="lg" type="light" />
		{/if}
		<span class="ui-tag__label">{label}</span>
		{#if suffix}<span class="ui-tag__suffix">{suffix}</span>{/if}
		{#if count !== null}
			<b class="ui-tag__count">x{count}</b>
		{/if}
	</span>
{/if}

<style lang="scss">
	.ui-tag {
		display: inline-flex;
		align-items: center;
		gap: var(--gutter-sm);
		min-height: var(--control-height-sm);
		border-radius: var(--radius);
		padding: 0 var(--gutter-md);
		font-size: var(--font-size-md);
		font-weight: var(--font-weight);
		white-space: nowrap;
		user-select: none;

		border: 1px solid var(--color-dark-tertiary);
		color: var(--color-text-secondary);

		transition: all var(--motion-fast) var(--motion-ease);

		&.ui-tag--interactive:hover {
			border-color: var(--color-accent-primary);
			color: var(--color-light-primary);
			transition: all 0ms;
		}
	}

	.ui-tag--interactive {
		cursor: pointer;
	}

	.ui-tag--selected {
		border-color: var(--color-accent-primary);
		color: var(--color-light-primary);
		background-color: rgbaa(var(--color-accent-primary), 0.1);
		box-shadow: 0 0 60px rgbaa(var(--color-accent-primary), 0.1);
		transition: all var(--motion-fast) var(--motion-ease);

		:global i {
			color: var(--color-accent-primary);
		}

		&.ui-tag--interactive:hover {
			border-color: var(--color-accent-primary);
			color: var(--color-light-primary);
		}
	}

	.ui-tag__count {
		color: var(--color-light-primary);
	}

	.ui-tag__suffix { color: var(--color-light-tertiary); }
</style>
