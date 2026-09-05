<script lang="ts">
	import type { TileItem } from "$lib/utils/playerDetailItems";
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte";
	import Tile from "$lib/components/ui/Tile.svelte";
	import TileGrid from "$lib/components/ui/TileGrid.svelte";

	export let title: string;
	export let items: TileItem[];
	export let columns: 1 | 2 | 3 = 2;
	export let help: string | null = null;
	export let busy = false;
	export let emptyItem: TileItem | null = null;
</script>

<section class="tile-section" aria-label={title} aria-busy={busy}>
	<PanelHeader variant="section" {title} {help}>
		<svelte:fragment slot="trailing">
			<slot name="trailing" />
		</svelte:fragment>
	</PanelHeader>
	<TileGrid {columns}>
		{#each items as item (item.title)}
			<Tile
				title={item.title}
				subtitle={item.subtitle ?? null}
				value={item.value ?? null}
				icon={item.icon}
				iconTone={item.iconTone}
				tone={item.tone ?? "default"}
				tooltip={item.tooltip ?? null}
			/>
		{:else}
			{#if emptyItem}
				<Tile
					title={emptyItem.title}
					subtitle={emptyItem.subtitle ?? null}
					icon={emptyItem.icon}
					iconTone={emptyItem.iconTone}
				/>
			{/if}
		{/each}
	</TileGrid>
</section>

<style lang="scss">
	.tile-section {
		display: grid;
		gap: var(--gutter-md);
	}
</style>
