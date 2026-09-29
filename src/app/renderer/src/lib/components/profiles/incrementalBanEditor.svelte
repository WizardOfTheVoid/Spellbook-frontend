<script lang="ts">
	import {
		validateIncrementalBan,
		type IncrementalBan,
	} from "@spellbook/shared/actions/incrementalBan";
	import type { FormOption } from "$lib/types/ui";
	import Select from "$lib/components/ui/Select.svelte";
	import MultiSelect from "$lib/components/ui/MultiSelect.svelte";
	import Input from "$lib/components/ui/Input.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import IconButton from "$lib/components/ui/IconButton.svelte";
	import InfoNotice from "$lib/components/ui/infoNotice.svelte";
	import BanDuration from "./banDuration.svelte";

	export let value: IncrementalBan;
	export let offenseOptions: FormOption[];
	export let disabled = false;
	export let onChange: (value: IncrementalBan) => void;

	const durationSteps = [1, 2, 3, 4, 8, 10, 12, 24, 48, 72, 96, 168, 336, 672];
	const windows = [
		{ value: `30`, label: `Last 30 days` },
		{ value: `90`, label: `Last 90 days` },
		{ value: `all`, label: `All time` },
	];
	const offenses = [
		{ value: `all`, label: `All offenses` },
		{ value: `specific`, label: `Specific offenses` },
	];
	$: error = validationError(value);

	function validationError(config: IncrementalBan): string {
		try {
			validateIncrementalBan(config);
			return ``;
		} catch (error) {
			return error instanceof Error ? error.message : `Invalid stages.`;
		}
	}

	function updateStage(
		index: number,
		patch: Partial<IncrementalBan[`stages`][number]>,
	): void {
		onChange({
			...value,
			stages: value.stages.map((stage, i) =>
				i === index ? { ...stage, ...patch } : stage,
			),
		});
	}
</script>

<div class="incremental-ban">
	<section class="incremental-ban__section" aria-label="Counting rules">
		<h4>Counting rules</h4>
		<div class="counting-fields">
			<Select
				label="Count bans from"
				options={windows}
				value={String(value.windowDays ?? `all`)}
				{disabled}
				onChange={(window) =>
					onChange({
						...value,
						windowDays:
							window === `all` ? null
							: window === `30` ? 30
							: 90,
					})}
			/>
			<Select
				label="Count offenses"
				options={offenses}
				value={value.offenseTypes === null ? `all` : `specific`}
				{disabled}
				onChange={(mode) =>
					onChange({ ...value, offenseTypes: mode === `all` ? null : [] })}
			/>
		</div>
		{#if value.offenseTypes !== null}
			<MultiSelect
				label="Specific offenses"
				options={offenseOptions}
				value={value.offenseTypes}
				{disabled}
				onChange={(offenseTypes) => onChange({ ...value, offenseTypes })}
			/>
		{/if}
		<small><strong>Note:</strong> Bans are only counted on this server.</small>
	</section>
	<section class="incremental-ban__section" aria-label="Ban stages">
		<h4>Stages</h4>
		{#each value.stages as stage, index}
			<div class="stage">
				<Input
					label="Bans"
					type="number"
					min={1}
					step={1}
					value={stage.banCount}
					{disabled}
					onChange={(count) => updateStage(index, { banCount: Number(count) })}
				/>
				<BanDuration
					value={stage.durationHours}
					steps={durationSteps}
					allowOutOfStep={true}
					{disabled}
					onChange={(durationHours) => updateStage(index, { durationHours })}
				/>
				<span class="delete-stage">
					<IconButton
						icon="fa-trash"
						iconSize="sm"
						ariaLabel={`Remove stage ${index + 1}`}
						tooltip="Remove stage"
						size="sm"
						disabled={disabled || value.stages.length === 1}
						hasPopup={null}
						onClick={() =>
							onChange({
								...value,
								stages: value.stages.filter((_, i) => i !== index),
							})}
					/>
				</span>
			</div>
		{/each}
		<Button
			label="Add stage"
			icon="fa-plus"
			size="sm"
			{disabled}
			onClick={() =>
				onChange({
					...value,
					stages: [
						...value.stages,
						{
							banCount:
								Math.max(0, ...value.stages.map((stage) => stage.banCount)) + 1,
							durationHours: value.stages.at(-1)?.durationHours ?? 24,
						},
					],
				})}
		/>
		{#if error}
			<div class="stage-warning" role="alert">
				<InfoNotice message={error} icon="fa-triangle-exclamation" />
			</div>
		{/if}
	</section>
</div>

<style lang="scss">
	.incremental-ban {
		display: grid;
		gap: var(--gutter-lg);
		grid-column: 1 / -1;
	}
	.incremental-ban__section {
		display: grid;
		gap: var(--gutter-md);
		min-width: 0;
	}
	.incremental-ban__section + .incremental-ban__section {
		padding-top: var(--gutter-lg);
		border-top: 1px solid var(--color-dark-tertiary);
	}
	h4 {
		margin: 0;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
	}
	.counting-fields {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--gutter-md);
	}
	.stage-warning :global(.info-notice p) {
		font-size: var(--font-size-xs);
	}
	.stage {
		display: grid;
		grid-template-columns: 41.25px minmax(0, 1fr) auto;
		padding: var(--gutter-md);
		border: 1px solid var(--color-dark-tertiary);
		border-radius: var(--radius);
		align-items: end;
		gap: var(--gutter-sm);
	}
	.stage :global(.ui-input input) {
		padding-inline: 4px;
		text-align: center;
	}
	.delete-stage {
		--control-height-sm: 28px;
		display: flex;
		align-items: center;
		height: var(--control-height-md);
	}
	small {
		color: var(--color-light-secondary);
	}
</style>
