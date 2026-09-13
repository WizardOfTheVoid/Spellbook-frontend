<script lang="ts">
	export let count = 0
	export let floating = false
</script>

{#if count > 0}
	<span class="count-badge" class:count-badge--floating={floating}>{count}</span>
{/if}

<style>
	.count-badge {
		min-width: 18px;
		height: 18px;
		display: inline-grid;
		place-items: center;
		border: 2px solid var(--color-dark-primary);
		border-radius: 999px;
		padding: 0 4px;
		color: var(--white);
		background: rgb(220 38 38);
		font-size: 9px;
		font-weight: var(--font-weight-bold);
		line-height: 1;
	}
	.count-badge--floating {
		position: absolute;
		top: -5px;
		right: -5px;
	}
</style>
