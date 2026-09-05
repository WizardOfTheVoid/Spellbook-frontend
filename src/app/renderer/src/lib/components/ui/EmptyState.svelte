<script lang="ts">
	export let title: string;
	export let message: string;
</script>

<div class="empty-state">
	<strong>{title}</strong>
	<span>{message}</span>
</div>

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
