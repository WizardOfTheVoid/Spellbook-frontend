<script lang="ts">
	import DateInput from "$lib/components/ui/DateInput.svelte";
	import { playerArchiveStart, playerDatePresets, playerLastSeenRangeValues, playerRangeValues } from './playerDateRange'
	import DoubleRange from "$lib/components/ui/DoubleRange.svelte";
	import Range from "$lib/components/ui/Range.svelte";
	import type { FilterChip } from "$lib/types/ui"
	import Icon from "$lib/components/ui/Icon.svelte"
	import {
		defaultPlayerFilters,
		formatPlaytimeHours,
		formatRank,
		MAX_PLAYER_RANK,
		MAX_OFFENSE_FILTER,
		MAX_PLAYTIME_HOURS,
		MIN_PLAYER_RANK,
		PLAYER_RANK_INFINITY,
		PLAYTIME_INFINITY,
		PLAYTIME_RANGE_STEP,
		type PlayerFilterState,
	} from "$lib/utils/playerArchive";

	const offenseSteps = Array.from({ length: MAX_OFFENSE_FILTER + 1 }, (_, count) => count)

	export let id = "advanced-player-filters";
	export let filters: PlayerFilterState = { ...defaultPlayerFilters };
	export let onChange: (filters: PlayerFilterState) => void = () => {};
	export let chips: FilterChip[] = []
	export let selectedChipIds: string[] = []
	export let onToggleChip: (id: string) => void = () => {}

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
	{#if chips.length}
		<div class="advanced-player-filters__presets" role="group" aria-label="Player filters">
			{#each chips as chip (chip.id)}
				<button type="button" title={chip.tooltip ?? undefined} aria-pressed={selectedChipIds.includes(chip.id)} class:advanced-player-filters__preset--active={selectedChipIds.includes(chip.id)} on:click={() => onToggleChip(chip.id)}>
					<Icon name={chip.icon ?? `fa-filter`} size="sm" />
					<span>{chip.label}</span>
					{#if selectedChipIds.includes(chip.id)}<Icon name="fa-check" size="xs" />{/if}
				</button>
			{/each}
		</div>
	{/if}

	<div class="advanced-player-filters__grid">
		<div class="offenses-range">
			<Range
				label="Minimum offenses"
				tooltip="Set the minimum recorded offense count. 10+ means ten or more."
				value={Math.max(0, Math.min(filters.minOffenses, MAX_OFFENSE_FILTER))}
				steps={offenseSteps}
				formatValue={(count) => count === MAX_OFFENSE_FILTER ? `${MAX_OFFENSE_FILTER}+` : `${count}`}
				onChange={(minOffenses) => update({ minOffenses })}
			/>
		</div>

		<div class="date-range">
			<DateInput
				label="Account created"
				tooltip="Select a date range or a recent period."
				value={filters.createdAfter}
				endValue={filters.createdBefore}
				range
				min={playerArchiveStart}
				maxToday
				presets={() => playerDatePresets(new Date())}
				onRangeChange={(start, end) => update(playerRangeValues(start, end))}
			/>
		</div>

		<div class="date-range">
			<DateInput
				label="Last active"
				tooltip="Select when the player was last seen."
				value={filters.lastSeenAfter}
				endValue={filters.lastSeenBefore}
				range
				min={playerArchiveStart}
				maxToday
				presets={() => playerDatePresets(new Date())}
				onRangeChange={(start, end) => update(playerLastSeenRangeValues(start, end))}
			/>
		</div>

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

	</div>
</section>

<style lang="scss">
	.advanced-player-filters {
		display: grid;
		gap: var(--gutter-md);
		padding: var(--gutter-md) 0;
	}

	.advanced-player-filters__grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--gutter-md) var(--gutter-lg);
	}

	.advanced-player-filters__presets { display: flex; flex-wrap: wrap; gap: var(--gutter-sm); }
	.advanced-player-filters__presets button { display: inline-flex; align-items: center; gap: var(--gutter-sm); min-height: var(--control-height-sm); border: 1px solid var(--color-dark-tertiary); border-radius: var(--radius); padding: 0 var(--gutter-md); background: transparent; color: var(--color-light-primary); font-size: var(--font-size-xs); }
	.advanced-player-filters__presets .advanced-player-filters__preset--active { border-color: var(--color-accent-secondary); background: rgbaa(var(--color-accent-secondary), 0.05); }

	.date-range, .offenses-range { min-width: 0; }
	.offenses-range { grid-column: 1 / -1; }

	.range {
		grid-column: 1 / -1;
	}

	@media (max-width: 600px) {
		.date-range, .offenses-range { grid-column: 1 / -1; }
	}
</style>
