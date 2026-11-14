<script lang="ts">
	import GridReferencePanel from "$lib/components/dev/gridReferencePanel.svelte"
</script>

<main class="grid-route">
	<GridReferencePanel />
</main>

<style lang="scss">
	.grid-route {
		box-sizing: border-box;
		min-height: 100vh;
		padding: var(--panel-padding);
		background: var(--color-dark-primary);
	}
</style>
