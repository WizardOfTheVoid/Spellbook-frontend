<script lang="ts">
	import { goto } from "$app/navigation";
	import Tile from "$lib/components/ui/Tile.svelte";
	import TileGrid from "$lib/components/ui/TileGrid.svelte";
</script>

<main class="dev-home">
	<header>
		<h1>Dev</h1>
	</header>

	<TileGrid columns={2}>
		<Tile
			title="GRID"
			subtitle="Grid system reference and examples"
			icon="fa-table-cells"
			onClick={() => goto("/dev/grid")}
		/>
		<Tile
			title="UI components"
			subtitle="Shared component gallery"
			icon="fa-layer-group"
			onClick={() => goto("/dev/ui")}
		/>
	</TileGrid>
</main>

<style lang="scss">
	.dev-home {
		min-height: 100vh;
		box-sizing: border-box;
		display: grid;
		align-content: start;
		gap: var(--gutter-lg);
		padding: var(--panel-padding);
		background: var(--color-dark-primary);
	}

	h1 {
		margin: 0;
		color: var(--color-light-primary);
		font-size: var(--font-size-xl);
	}

	@media (max-width: 640px) {
		:global(.dev-home .tile-grid) {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
