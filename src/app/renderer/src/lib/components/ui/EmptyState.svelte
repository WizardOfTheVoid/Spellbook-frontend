<script lang="ts">
	export let title: string;
	export let message: string;
	export let onClick: (() => void) | null = null
</script>

{#snippet content()}
	<strong>{title}</strong>
	<span>{message}</span>
{/snippet}

{#if onClick}
	<button type="button" class="empty-state" on:click={onClick}>{@render content()}</button>
{:else}
	<div class="empty-state">{@render content()}</div>
{/if}

<style lang="scss">
	.empty-state {
		display: grid;
		gap: var(--gutter-sm);
		border: 2px dashed var(--color-dark-tertiary);
		border-radius: var(--radius-xl);
		padding: var(--gutter-lg);
		color: var(--color-light-secondary);
		text-align: center;
		user-select: none;
	}
	button.empty-state {
		width: 100%;
		background: transparent;
		cursor: pointer;
	}

	strong {
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-medium);
		color: var(--color-light-secondary);
	}

	span {
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight);
		color: var(--color-light-tertiary);
	}
</style>
