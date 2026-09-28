<script lang="ts">
	import type { Tone } from "$lib/types/tone";
	import { resolveToneColor, toneStyle } from "$lib/utils/tones";
	import Icon from "./Icon.svelte";

	export let value: string;
	export let icon: string | null = null;
	export let label: string | null = null;
	export let tone: Tone = "success";
	export let iconColor: string | null = null;
	export let valueTone: Tone = "bright";
	export let showLabel = true;
</script>

<span
	class="stat-chip"
	style={toneStyle(valueTone)}
	aria-label={label ? `${label}: ${value}` : value}
>
	{#if icon}
		<Icon name={icon} size="sm" tone={resolveToneColor(tone, iconColor)} />
	{/if}
	{#if label && showLabel}
		<small class="stat-chip__label">{label}</small>
	{/if}
	<b class="stat-chip__value">{value}</b>
</span>

<style lang="scss">
	.stat-chip {
		display: inline-flex;
		align-items: center;
		gap: var(--gutter-sm);
		color: var(--color-text-secondary);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		white-space: nowrap;
	}

	.stat-chip__value {
		color: var(--tone);
		font-size: var(--font-size-xs);
	}
</style>
