<script lang="ts">
	import type { ControlSize, Tone } from "$lib/types/tone";
	import { toneStyle } from "$lib/utils/tones";
	import Icon from "./Icon.svelte";

	export let name: string | null = null;
	export let tone: Tone = "default";
	export let variant: "ring" | "soft" | "solid" = "soft";
	export let size: ControlSize = "md";
	export let shape: "round" | "rounded" = "rounded";
	export let label: string | null = null;
	export let iconType: "solid" | "regular" | "light" | "thin" | "brands" = "light"
	export let iconColor: string | null = null
</script>

<span
	class={`icon-badge icon-badge--${variant} icon-badge--${size} icon-badge--${shape}`}
	style={toneStyle(tone)}
>
	{#if label}
		<span class="icon-badge__label">{label}</span>
	{:else if name}
		<Icon {name} {size} type={iconType} tone={iconColor ?? `inherit`} />
	{/if}
</span>

<style lang="scss">
	.icon-badge {
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		color: var(--tone);
		user-select: none;
	}

	.icon-badge--sm {
		width: 28px;
		height: 28px;
	}

	.icon-badge--md {
		width: var(--avatar-size);
		height: var(--avatar-size);
	}

	.icon-badge--lg {
		width: 54px;
		height: 54px;
	}

	.icon-badge--rounded {
		border-radius: var(--radius-xl);
	}

	.icon-badge--round {
		border-radius: 9999px;
	}

	.icon-badge--soft {
		border: 1px solid var(--color-dark-secondary);
	}

	.icon-badge--ring {
		border: 1px solid currentcolor;
	}

	.icon-badge--solid {
		color: var(--color-dark-primary);
		background: var(--tone);
	}

	.icon-badge__label {
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
	}
</style>
