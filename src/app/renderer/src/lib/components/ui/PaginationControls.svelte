<script lang="ts">
	import Button from "./Button.svelte";

	export let currentPage: number;
	export let totalPages: number;
	export let hasPrevious: boolean;
	export let hasNext: boolean;
	export let disabled = false;
	export let onPrevious: () => void;
	export let onNext: () => void;
</script>

<div class="pagination">
	<Button
		label="Previous"
		icon="fa-chevron-left"
		size="sm"
		disabled={!hasPrevious || disabled}
		onClick={onPrevious}
	/>
	<span class="pagination__status"
		>{currentPage} / {Math.max(1, totalPages)}</span
	>
	<Button
		label="Next"
		icon="fa-chevron-right"
		size="sm"
		disabled={!hasNext || disabled}
		onClick={onNext}
	/>
</div>

<style lang="scss">
	.pagination {
		display: flex;
		align-items: center;
		gap: var(--gutter-md);
		color: var(--color-text-secondary);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
	}

	.pagination__status {
		flex: 1 1 auto;
		min-width: 0;
		text-align: center;
	}
</style>
