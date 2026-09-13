<script lang="ts">
	import type { Snippet } from "svelte"

	export let title: string
	export let subtitle: string
	export let content: Snippet
</script>

<div class="detailed-tooltip">
	<div class="detailed-tooltip__heading">
		<strong>{title}</strong>
		<div class="detailed-tooltip__subtitle">{subtitle}</div>
	</div>
	<div class="detailed-tooltip__content">
		{@render content()}
	</div>
</div>

<style lang="scss">
	.detailed-tooltip {
		width: 360px;
		max-width: calc(100vw - 24px);
		box-sizing: border-box;
		display: grid;
		gap: var(--gutter-md);
		padding: calc(var(--gutter) * 1.25);
		border: 1px solid var(--color-dark-tertiary);
		border-radius: var(--radius);
		background: color-mix(in srgb, var(--color-dark-primary), var(--color-light-tertiary) 6%);
		color: var(--color-light-primary);
		font-size: var(--font-size-md);
		line-height: 1.4;
	}

	.detailed-tooltip__heading {
		min-width: 0;
		display: grid;
		gap: var(--gutter-sm);
	}

	strong {
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-medium);
		overflow-wrap: anywhere;
	}

	.detailed-tooltip__subtitle {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		color: var(--color-light-tertiary);
	}

	.detailed-tooltip__content {
		min-width: 0;
		overflow-wrap: anywhere;
	}
</style>
