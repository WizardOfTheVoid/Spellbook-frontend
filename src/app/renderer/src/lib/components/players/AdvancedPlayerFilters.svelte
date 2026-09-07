<script lang="ts">
	import DateInput from "$lib/components/ui/DateInput.svelte";
	import DoubleRange from "$lib/components/ui/DoubleRange.svelte";
	import Range from "$lib/components/ui/Range.svelte";
	import Select from "$lib/components/ui/Select.svelte"
	import Toggle from "$lib/components/ui/Toggle.svelte";
	import type { FormOption } from "$lib/types/ui"
	import {
		defaultPlayerFilters,
		formatPlaytimeHours,
		formatRank,
		MAX_PLAYER_RANK,
		MAX_PLAYTIME_HOURS,
		MIN_PLAYER_RANK,
		PLAYER_RANK_INFINITY,
		PLAYTIME_INFINITY,
		PLAYTIME_RANGE_STEP,
		type PlayerFilterState,
	} from "$lib/utils/playerArchive";

	const SORT_BY_OPTIONS: FormOption[] = [
		{ value: "lastSeen", label: "Last seen" },
		{ value: "rank", label: "Rank" },
		{ value: "accountCreated", label: "Account created" },
	]
	const SORT_ORDER_OPTIONS: FormOption[] = [
		{ value: "desc", label: "Descending" },
		{ value: "asc", label: "Ascending" },
	]

	export let id = "advanced-player-filters";
	export let filters: PlayerFilterState = { ...defaultPlayerFilters };
	export let mode: "database" | "live" = "database"
	export let onChange: (filters: PlayerFilterState) => void = () => {};

	function update(change: Partial<PlayerFilterState>): void {
		onChange({ ...filters, ...change });
	}

	function updateRank(minRank: number, maxRank: number): void {
		update({ minRank: Math.min(minRank, MAX_PLAYER_RANK), maxRank })
	}

	function updatePlaytime(minPlaytimeHours: number, maxPlaytimeHours: number): void {
		update({
			minPlaytimeHours: Math.min(minPlaytimeHours, MAX_PLAYTIME_HOURS),
			maxPlaytimeHours,
		})
	}
</script>

<section
	{id}
	class="advanced-player-filters"
	aria-label="Advanced player filters"
>
	<h3>Advanced filters</h3>

	<div class="advanced-player-filters__grid">
		<Toggle
			label="Show only offenders"
			tooltip="Require at least one recorded offense."
			checked={filters.offendersOnly}
			onChange={(offendersOnly) => update({ offendersOnly })}
		/>

		<Toggle
			label="Show clan members"
			description="Clan membership filtering is not available yet."
			tooltip="Clan membership filtering is not available yet."
			checked={filters.clanMembersOnly}
			disabled
		/>

		<div class="date-range">
			<DateInput
				label="Account created after"
				tooltip="Only accounts created on or after this date."
				value={filters.createdAfter}
				max={filters.createdBefore || null}
				onChange={(createdAfter) => update({ createdAfter })}
			/>
			<DateInput
				label="Account created before"
				tooltip="Only accounts created on or before this date."
				value={filters.createdBefore}
				min={filters.createdAfter || null}
				onChange={(createdBefore) => update({ createdBefore })}
			/>
		</div>

		<Range
			label="Offenses"
			tooltip="Set the minimum recorded offense count."
			value={filters.minOffenses}
			max={100}
			onChange={(minOffenses) => update({ minOffenses })}
		/>

		<div class="range">
			<DoubleRange
				label="Rank"
				tooltip="Limit results to this rank range."
				minimumValue={filters.minRank}
				maximumValue={filters.maxRank}
				min={MIN_PLAYER_RANK}
				max={PLAYER_RANK_INFINITY}
				formatValue={formatRank}
				onChange={updateRank}
			/>
		</div>

		<div class="range">
			<DoubleRange
				label="Playtime"
				tooltip="Limit results to this playtime range in hours."
				minimumValue={filters.minPlaytimeHours}
				maximumValue={filters.maxPlaytimeHours}
				max={PLAYTIME_INFINITY}
				step={PLAYTIME_RANGE_STEP}
				formatValue={formatPlaytimeHours}
				onChange={updatePlaytime}
			/>
		</div>

		{#if mode === "database"}
			<div class="sort-controls">
				<Select
					label="Sort by"
					tooltip="Choose which player field controls result order."
					value={filters.sortBy}
					options={SORT_BY_OPTIONS}
					onChange={(sortBy) => update({ sortBy: sortBy as PlayerFilterState["sortBy"] })}
				/>
				<Select
					label="Order"
					tooltip="Choose ascending or descending result order."
					value={filters.sortOrder}
					options={SORT_ORDER_OPTIONS}
					onChange={(sortOrder) => update({ sortOrder: sortOrder as PlayerFilterState["sortOrder"] })}
				/>
			</div>
		{/if}
	</div>
</section>

<style lang="scss">
	.advanced-player-filters {
		display: grid;
		gap: var(--gutter-md);
		border-block: 1px solid var(--color-dark-secondary);
		padding: var(--gutter-md) 0;
		animation: advanced-player-filters-in var(--motion-slow) var(--motion-ease);
	}

	h3 {
		margin: 0;
		font-size: var(--font-size-sm);
		letter-spacing: 0;
	}

	.advanced-player-filters__grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--gutter-md) var(--gutter-lg);
	}

	.date-range {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--gutter-md);
	}

	.range {
		grid-column: 1 / -1;
	}

	.sort-controls {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--gutter-md);
	}

	@keyframes advanced-player-filters-in {
		from {
			opacity: 0;
			transform: translateY(-20px);
		}

		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.advanced-player-filters {
			animation: none;
		}
	}
</style>
