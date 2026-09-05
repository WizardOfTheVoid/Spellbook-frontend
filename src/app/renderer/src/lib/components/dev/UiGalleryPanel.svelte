<script lang="ts">
	import type { FilterChip, FormOption, MenuItem } from "$lib/types/ui";
	import type { ControlSize, Tone } from "$lib/types/tone";
	import ActionRow from "$lib/components/ui/ActionRow.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Checkbox from "$lib/components/ui/Checkbox.svelte";
	import DateInput from "$lib/components/ui/DateInput.svelte";
	import DoubleRange from "$lib/components/ui/DoubleRange.svelte";
	import EmptyState from "$lib/components/ui/EmptyState.svelte";
	import FilterChipRow from "$lib/components/ui/FilterChipRow.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";
	import IconBadge from "$lib/components/ui/IconBadge.svelte";
	import IconButton from "$lib/components/ui/IconButton.svelte";
	import Input from "$lib/components/ui/Input.svelte";
	import ListRow from "$lib/components/ui/ListRow.svelte";
	import MultiSelect from "$lib/components/ui/MultiSelect.svelte";
	import PaginationControls from "$lib/components/ui/PaginationControls.svelte";
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte";
	import RadioGroup from "$lib/components/ui/RadioGroup.svelte";
	import Range from "$lib/components/ui/Range.svelte";
	import RowMenu from "$lib/components/ui/RowMenu.svelte";
	import SearchField from "$lib/components/ui/SearchField.svelte";
	import Select from "$lib/components/ui/Select.svelte";
	import StatBar from "$lib/components/ui/StatBar.svelte";
	import StatChip from "$lib/components/ui/StatChip.svelte";
	import Tag from "$lib/components/ui/Tag.svelte";
	import Tile from "$lib/components/ui/Tile.svelte";
	import TileGrid from "$lib/components/ui/TileGrid.svelte";
	import Toggle from "$lib/components/ui/Toggle.svelte";

	const tones: Tone[] = [
		"default",
		"bright",
		"muted",
		"accent",
		"success",
		"danger",
		"warning",
		"info",
	];

	const badgeVariants: ("soft" | "ring" | "solid")[] = [
		"soft",
		"ring",
		"solid",
	];
	const badgeSizes: ControlSize[] = ["sm", "md", "lg"];

	const menuItems: MenuItem[] = [
		{ label: "View profile", icon: "fa-user", onSelect: () => {} },
		{ label: "Copy PlayFab ID", icon: "fa-copy", onSelect: () => {} },
		{ label: "Kick", icon: "fa-ban", tone: "danger", onSelect: () => {} },
	];

	const filterChips: FilterChip[] = [
		{ id: "wanted", label: "Wanted", icon: "fa-crosshairs" },
		{ id: "low-rank", label: "Low rank", icon: "fa-circle-user" },
		{ id: "non-eu", label: "Non-EU", icon: "fa-globe" },
		{ id: "priors", label: "Priors", icon: "fa-gavel" },
	];
	const formOptions: FormOption[] = [
		{ value: "eu-west", label: "EU West" },
		{ value: "na-east", label: "NA East" },
		{ value: "na-west", label: "NA West" },
		{ value: "oce", label: "Oceania", disabled: true },
	];
	const radioOptions: FormOption[] = [
		{ value: "all", label: "All players" },
		{ value: "online", label: "Online" },
		{ value: "offline", label: "Offline" },
	];
	const offenseRangeOptions: FormOption[] = [
		{ value: "30", label: "Last 30 days" },
		{ value: "all", label: "All time" },
	];

	let selectedFilters = ["low-rank"];
	let search = "";
	let inputValue = "Magic Trashcan";
	let emailValue = "admin@example.com";
	let numberValue = "24";
	let dateValue = "";
	let checkboxOn = true;
	let toggleOn = true;
	let radioValue = "online";
	let rangeValue = 35;
	let minimumRank = 120;
	let maximumRank = 2400;
	let selectValue = "eu-west";
	let multiSelectValue = ["eu-west", "na-east"];
	let offenseRange = "30";

	export let hidden = false;

	function toggleFilter(id: string): void {
		selectedFilters =
			selectedFilters.includes(id) ?
				selectedFilters.filter((entry) => entry !== id)
			:	[...selectedFilters, id];
	}
</script>

<section {hidden} class="panel-view gallery" aria-label="UI primitives">
	<h1>UI primitives</h1>

	<section>
		<h2>Icon</h2>
		<div class="specimens">
			{#each tones as tone}
				<span class="specimen"
					><Icon name="fa-bolt" {tone} size="lg" /><code>{tone}</code></span
				>
			{/each}
		</div>
	</section>

	<section>
		<h2>IconBadge</h2>
		<div class="specimens">
			{#each badgeVariants as variant}
				<span class="specimen">
					<IconBadge name="fa-crosshairs" tone="success" {variant} />
					<code>{variant}</code>
				</span>
			{/each}
			{#each badgeSizes as size}
				<span class="specimen">
					<IconBadge name="fa-skull" tone="danger" {size} shape="round" />
					<code>round {size}</code>
				</span>
			{/each}
			<span class="specimen"
				><IconBadge label="MT" tone="success" /><code>initials</code></span
			>
		</div>
	</section>

	<section>
		<h2>Button / IconButton</h2>
		<div class="specimens">
			<Button label="Primary" icon="fa-bolt" variant="primary" />
			<Button label="Ghost" icon="fa-rotate" />
			<Button label="Danger" icon="fa-ban" variant="danger" />
			<Button label="Disabled" icon="fa-rotate" disabled />
			<Button label="Small" size="sm" />
			<Button label="Large" size="lg" />
			<IconButton icon="fa-chevron-left" ariaLabel="Back" />
			<IconButton icon="fa-xmark" ariaLabel="Close" shape="round" />
			<IconButton icon="fa-sliders" ariaLabel="Filters" tone="accent" />
		</div>
	</section>

	<section>
		<h2>Tag</h2>
		<div class="specimens">
			<Tag label="FFA" count={4} selected onClick={() => {}} />
			<Tag label="Racism" />
			<Tag label="Votekick Abuser" icon="fa-gavel" />
			<Tag label="Griefer" selected />
		</div>
	</section>

	<section>
		<h2>StatChip</h2>
		<div class="specimens">
			<StatChip
				icon="fa-swords"
				label="Kills / deaths"
				value="24/5"
				iconColor="var(--color-accent-secondary)"
			/>
			<StatChip
				icon="fa-ranking-star"
				label="Rank"
				value="454"
				iconColor="var(--color-accent-primary)"
			/>
			<StatChip
				icon="fa-signal"
				label="Ping"
				value="32 ms"
				iconColor="var(--color-accent-tertiary)"
			/>
		</div>
	</section>

	<section>
		<h2>StatBar</h2>
		<StatBar
			stats={[
				{ icon: "fa-crosshairs", value: "28 / 1", tone: "success" },
				{ icon: "fa-user-group", value: "2", tone: "accent" },
				{ icon: "fa-skull", value: "0", tone: "danger" },
				{ icon: "fa-signal", value: "5 ms", tone: "warning" },
			]}
			{menuItems}
		/>
	</section>

	<section>
		<h2>PanelHeader</h2>
		<PanelHeader
			title="The Templar Game Server"
			eyebrow="Game Server"
			leadingIcon="fa-xmark"
			onLeading={() => {}}
		>
			<svelte:fragment slot="trailing">
				<IconButton icon="fa-rotate" ariaLabel="Refresh" />
			</svelte:fragment>
		</PanelHeader>
	</section>

	<section>
		<h2>PanelHeader (section variant)</h2>
		<PanelHeader
			variant="section"
			title="Prior offenses"
			help="Offenses recorded for this player."
		>
			<svelte:fragment slot="trailing">
				<Select
					label="Range"
					showLabel={false}
					options={offenseRangeOptions}
					value={offenseRange}
					onChange={(next) => (offenseRange = next)}
				/>
			</svelte:fragment>
		</PanelHeader>
	</section>

	<section>
		<h2>Tile / TileGrid</h2>
		<TileGrid columns={3}>
			<Tile
				icon="fa-crosshairs"
				iconTone="success"
				title="Kills"
				subtitle="12"
			/>
			<Tile icon="fa-skull" iconTone="danger" title="Deaths" subtitle="78" />
			<Tile
				icon="fa-network-wired"
				iconTone="warning"
				title="Ping"
				subtitle="55 ms"
			/>
		</TileGrid>
		<TileGrid columns={2}>
			<Tile
				icon="fa-gavel"
				iconTone="accent"
				title="Total bans"
				subtitle="4 times"
			/>
			<Tile
				icon="fa-globe"
				iconTone="info"
				title="Global bans"
				subtitle="6 times"
			/>
			<Tile
				icon="fa-bolt"
				iconTone="accent"
				title="Actions"
				subtitle="Player actions"
				onClick={() => {}}
			/>
			<Tile
				icon="fa-clock-rotate-left"
				iconTone="danger"
				title="Logs"
				subtitle="Historic offenses"
				onClick={() => {}}
			/>
		</TileGrid>
	</section>

	<section>
		<h2>ActionRow</h2>
		<ActionRow
			title="Ban 24h"
			description="Ban this player for one day."
			meta="1. ban 24h / 2. server message after 500ms"
			status="2 commands"
			onClick={() => {}}
		/>
	</section>

	<section>
		<h2>SearchField / FilterChipRow</h2>
		<SearchField
			bind:value={search}
			placeholder="Search for ID, clan, name, etc ..."
		>
			<svelte:fragment slot="trailing">
				<IconButton icon="fa-sliders" ariaLabel="Advanced filters" />
			</svelte:fragment>
		</SearchField>
		<FilterChipRow
			chips={filterChips}
			selected={selectedFilters}
			onToggle={toggleFilter}
		/>
	</section>

	<section>
		<h2>ListRow</h2>
		<ListRow
			title="Magic Trashcan"
			subtitle="25F6D104A89A3070"
			onClick={() => {}}
		>
			<svelte:fragment slot="leading">
				<IconBadge label="MA" tone="success" />
			</svelte:fragment>
			<svelte:fragment slot="trailing">
				<StatChip
					icon="fa-swords"
					value="24/5"
					iconColor="var(--color-accent-secondary)"
					showLabel={false}
				/>
				<StatChip
					icon="fa-ranking-star"
					value="454"
					iconColor="var(--color-accent-primary)"
					showLabel={false}
				/>
				<StatChip
					icon="fa-signal"
					value="32 ms"
					iconColor="var(--color-accent-tertiary)"
					showLabel={false}
				/>
				<IconButton
					icon="fa-ellipsis-vertical"
					ariaLabel="Actions for Magic Trashcan"
				/>
			</svelte:fragment>
		</ListRow>
	</section>

	<section>
		<h2>Input / DateInput</h2>
		<div class="control-grid">
			<Input
				label="Player name"
				value={inputValue}
				placeholder="Enter a player name"
				icon="fa-user"
				button="fa-xmark"
				buttonAriaLabel="Clear player name"
				buttonAction={() => (inputValue = "")}
				hint="Text, search, email, password, number, tel, and URL are supported."
				onChange={(next) => (inputValue = next)}
			/>
			<Input
				label="Admin email"
				type="email"
				value={emailValue}
				onChange={(next) => (emailValue = next)}
			/>
			<Input
				label="Ban duration"
				type="number"
				value={numberValue}
				min={0}
				max={999999}
				onChange={(next) => (numberValue = next)}
			/>
			<DateInput
				label="Account created after"
				value={dateValue}
				onChange={(next) => (dateValue = next)}
			/>
		</div>
	</section>

	<section>
		<h2>Radio / Checkbox / Toggle</h2>
		<div class="control-grid" inert>
			<RadioGroup
				label="Player status"
				options={radioOptions}
				value={radioValue}
			/>
			<div class="control-stack">
				<Checkbox
					label="Show only offenders"
					description="Players with one or more recorded offenses."
					checked={checkboxOn}
				/>
				<Toggle
					label="Include clan members"
					description="Show recognized clan members in results."
					checked={toggleOn}
				/>
			</div>
		</div>
	</section>

	<section>
		<h2>Range / DoubleRange</h2>
		<div class="control-grid">
			<Range
				label="Minimum offenses"
				value={rangeValue}
				max={100}
				onChange={(next) => (rangeValue = next)}
			/>
			<DoubleRange
				label="Rank"
				minimumValue={minimumRank}
				maximumValue={maximumRank}
				min={1}
				max={5000}
				onChange={(minimum, maximum) => {
					minimumRank = minimum;
					maximumRank = maximum;
				}}
			/>
		</div>
	</section>

	<section>
		<h2>Single / Multi Select</h2>
		<div class="control-stack">
			<Select
				label="Primary region"
				options={formOptions}
				value={selectValue}
				onChange={(next) => (selectValue = next)}
			/>
			<MultiSelect
				label="Allowed regions"
				options={formOptions}
				value={multiSelectValue}
				onChange={(next) => (multiSelectValue = next)}
			/>
		</div>
	</section>

	<section>
		<h2>Pagination / EmptyState</h2>
		<PaginationControls
			currentPage={1}
			totalPages={2}
			hasPrevious={false}
			hasNext
			onPrevious={() => {}}
			onNext={() => {}}
		/>
		<EmptyState title="No players" message="Waiting for ListPlayers data." />
	</section>
</section>

<style lang="scss">
	.gallery {
		height: 100%;
		display: grid;
		align-content: start;
		gap: var(--gutter-lg);
		padding: var(--panel-padding);
		overflow: auto;
	}

	section {
		display: grid;
		gap: var(--gutter-md);
		border-top: 1px solid var(--color-dark-secondary);
		padding-top: var(--gutter-lg);
	}

	h2 {
		margin: 0;
		color: var(--color-accent-tertiary);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		text-transform: uppercase;
	}

	.specimens {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--gutter-lg);
	}

	.specimen {
		display: inline-grid;
		justify-items: center;
		gap: var(--gutter-sm);
	}

	.control-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		align-items: start;
		gap: var(--gutter-lg);
	}

	.control-stack {
		display: grid;
		gap: var(--gutter-lg);
	}

	@media (max-width: 720px) {
		.control-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	code {
		color: var(--color-light-tertiary);
		font-size: var(--font-size-xs);
	}
</style>
