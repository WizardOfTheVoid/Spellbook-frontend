<script lang="ts">
	import type { FormOption } from "$lib/types/ui";
	import type { ServerFilterState } from "$lib/utils/serverArchive";
	import Checkbox from "$lib/components/ui/Checkbox.svelte";
	import DoubleRange from "$lib/components/ui/DoubleRange.svelte";
	import Select from "$lib/components/ui/Select.svelte";

	export let filters: ServerFilterState;
	export let regions: string[] = [];
	export let gameModes: string[] = [];
	export let isSuperadmin = false;
	export let onChange: (filters: ServerFilterState) => void;

	const sortOptions: FormOption[] = [
		{ value: "default", label: "Default" },
		{ value: "players", label: "Players" },
		{ value: "alphabetical", label: "Alphabetical" },
	];
	const orderOptions: FormOption[] = [
		{ value: "desc", label: "Descending" },
		{ value: "asc", label: "Ascending" },
	];

	function update(change: Partial<ServerFilterState>): void {
		onChange({ ...filters, ...change });
	}

	$: regionOptions = [{ value: ``, label: `Any region` }, ...regions.map(value => ({ value, label: value }))];
	$: gameModeOptions = [{ value: ``, label: `Any game mode` }, ...gameModes.map(value => ({ value, label: value }))];
</script>

<section class="advanced-server-filters" id="advanced-server-filters">
	<h3>Advanced server filters</h3>
	<div class="advanced-server-filters__grid">
		<Select label="Region" value={filters.region} options={regionOptions} onChange={(region) => update({ region })} />
		<Select label="Game mode" value={filters.gameMode} options={gameModeOptions} onChange={(gameMode) => update({ gameMode })} />
		<div class="advanced-server-filters__wide"><DoubleRange label="Slots" min={1} max={90} minimumValue={filters.minSlots} maximumValue={filters.maxSlots} onChange={(minSlots, maxSlots) => update({ minSlots, maxSlots })} /></div>
		<div class="advanced-server-filters__wide"><DoubleRange label="Players" min={0} max={90} minimumValue={filters.minPlayers} maximumValue={filters.maxPlayers} onChange={(minPlayers, maxPlayers) => update({ minPlayers, maxPlayers })} /></div>
		<Select label="Sort by" value={filters.sortBy} options={sortOptions} onChange={(sortBy) => update({ sortBy: sortBy as ServerFilterState["sortBy"] })} />
		{#if filters.sortBy !== `default`}<Select label="Order" value={filters.sortOrder} options={orderOptions} onChange={(sortOrder) => update({ sortOrder: sortOrder as ServerFilterState["sortOrder"] })} />{/if}
		{#if isSuperadmin}<div class="advanced-server-filters__wide"><Checkbox label="Deleted" description="Show only soft-deleted servers." checked={filters.deleted === `deleted`} onChange={checked => update({ deleted: checked ? `deleted` : `active` })} /></div>{/if}
	</div>
</section>

<style lang="scss">
	.advanced-server-filters { display: grid; gap: var(--gutter-md); border-block: 1px solid var(--color-dark-secondary); padding: var(--gutter-md) 0; }
	h3 { margin: 0; font-size: var(--font-size-sm); }
	.advanced-server-filters__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gutter-md) var(--gutter-lg); }
	.advanced-server-filters__wide { grid-column: 1 / -1; }
</style>

