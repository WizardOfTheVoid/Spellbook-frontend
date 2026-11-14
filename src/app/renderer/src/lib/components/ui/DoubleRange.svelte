<script lang="ts">
	import { nearestRangeHandle } from './range/rangeInteraction'
	import { createRangeScale } from './range/rangeScale'
	import RangeTicks from './range/rangeTicks.svelte'
	import RangeTrack from './range/rangeTrack.svelte'
	import RangeThumb from './range/rangeThumb.svelte'
	import { createControlId } from "$lib/utils/controlIds";
	import { rangeSfxVolume } from "$lib/global/sfx/sfx-settings";
	import { tooltip as tooltipAction } from "$lib/utils/tooltip";

	export let minimumValue: number;
	export let maximumValue: number;
	export let label = ``
	export let ariaLabel = `Range`
	export let id: string | null = null;
	export let min = 0;
	export let max = 100;
	export let step = 1;
	export let steps: readonly number[] = []
	export let allowOutOfStep = false
	export let naturalStepSpacing = false
	export let disabled = false;
	export let tooltip: string | null = null;
	export let formatCurrentValue: ((value: number) => string) | null = null
	export let formatValue: (value: number) => string = (current) => `${current}`;
	export let onChange: ((minimum: number, maximum: number) => void) | null =
		null;

	let control: HTMLDivElement;
	let controlWidth = 0
	let minimumInput: HTMLInputElement;
	let maximumInput: HTMLInputElement;
	let dragging = false
	const generatedId = createControlId("double-range");

	$: currentValueFormatter = formatCurrentValue ?? formatValue
	$: accessibleLabel = label || ariaLabel
	$: controlId = id ?? generatedId;
	$: naturalSpacing = ($$restProps[`natural-step-spacing`] ?? naturalStepSpacing) === true
	$: scale = createRangeScale(min, max, step, steps, naturalSpacing, controlWidth)
	$: allowCustomValue = ($$restProps[`allow-out-of-step`] ?? allowOutOfStep) === true
	$: start = scale.progress(minimumValue)
	$: end = scale.progress(maximumValue)
	$: labelsOverlap = !scale.ticks.length && (end - start) * controlWidth / 100 < 72

	function setMinimum(value: number): void {
		if (disabled) return
		const nextValue = Math.min(scale.snap(value, allowCustomValue), maximumValue)
		if (nextValue === minimumValue) return;
		SFX.play(`volume-change`, { volume: rangeSfxVolume(nextValue, scale.min, scale.max) })
		onChange?.(nextValue, maximumValue);
	}

	function setMaximum(value: number): void {
		if (disabled) return
		const nextValue = Math.max(scale.snap(value, allowCustomValue), minimumValue)
		if (nextValue === maximumValue) return;
		SFX.play(`volume-change`, { volume: rangeSfxVolume(nextValue, scale.min, scale.max) })
		onChange?.(minimumValue, nextValue);
	}

	function setFromPointer(
		clientX: number,
		handle: "minimum" | "maximum",
	): void {
		const bounds = control.getBoundingClientRect();
		const ratio = Math.min(
			1,
			Math.max(0, (clientX - bounds.left) / bounds.width),
		);
		const nextValue = scale.fromRatio(ratio)
		if (handle === "minimum") setMinimum(nextValue);
		else setMaximum(nextValue);
	}
</script>

<fieldset class="ui-double-range" use:tooltipAction={tooltip ?? ""}>
	{#if label}
	<legend class="ui-double-range__header">
		<span>{label}</span>
	</legend>
	{/if}
	<div
		bind:this={control}
		bind:clientWidth={controlWidth}
		class="ui-double-range__control"
		class:dragging
	>
		<RangeTrack {start} {end} {disabled} />
		<RangeTicks label={accessibleLabel} onSelect={(index) => nearestRangeHandle(scale.ticks[index], start, end) === `minimum` ? setMinimum(scale.tickValues[index]) : setMaximum(scale.tickValues[index])} positions={scale.ticks} labels={scale.tickValues.map(formatValue)} values={scale.tickValues} selectedValues={[minimumValue, maximumValue]} {disabled} />
		<input
			bind:this={minimumInput}
			id={`${controlId}-minimum`}
			class="ui-double-range__input ui-double-range__input--minimum"
			type="range"
			min={scale.inputMin}
			max={scale.inputMax}
			step={scale.inputStep}
			value={scale.toInput(minimumValue)}
			{disabled}
			aria-valuemin={scale.min}
			aria-valuemax={maximumValue}
			aria-valuenow={minimumValue}
			aria-label={`Minimum ${accessibleLabel}`}
			aria-valuetext={currentValueFormatter(minimumValue)}
			on:input={(event) => setMinimum(scale.fromInput(event.currentTarget.valueAsNumber))}
		/>
		<input
			bind:this={maximumInput}
			id={`${controlId}-maximum`}
			class="ui-double-range__input ui-double-range__input--maximum"
			type="range"
			min={scale.inputMin}
			max={scale.inputMax}
			step={scale.inputStep}
			value={scale.toInput(maximumValue)}
			{disabled}
			aria-valuemin={minimumValue}
			aria-valuemax={scale.max}
			aria-valuenow={maximumValue}
			aria-label={`Maximum ${accessibleLabel}`}
			aria-valuetext={currentValueFormatter(maximumValue)}
			on:input={(event) => setMaximum(scale.fromInput(event.currentTarget.valueAsNumber))}
		/>
		<RangeThumb value={minimumValue} label={`Minimum ${accessibleLabel}`} {disabled} formatValue={currentValueFormatter} position={start} hasSteps={scale.ticks.length > 0}
			onChange={setMinimum} onMove={(x) => setFromPointer(x, `minimum`)} onFocus={() => minimumInput.focus()} onDragChange={(active) => dragging = active} />
		<RangeThumb value={maximumValue} label={`Maximum ${accessibleLabel}`} {disabled} formatValue={currentValueFormatter} position={end} row={labelsOverlap ? 1 : 0} hasSteps={scale.ticks.length > 0}
			onChange={setMaximum} onMove={(x) => setFromPointer(x, `maximum`)} onFocus={() => maximumInput.focus()} onDragChange={(active) => dragging = active} />
	</div>
</fieldset>

<style lang="scss">
	.ui-double-range {
		min-width: 0;
		display: grid;
		gap: var(--gutter-sm);
		border: 0;
		padding: 0;
		color: var(--color-light-secondary);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
	}

	.ui-double-range__header {
		margin-bottom: var(--gutter-sm);
		width: 100%;
		display: flex;
		justify-content: space-between;
		gap: var(--gutter-md);
		padding: 0;
	}

	.ui-double-range__control {
		--range-duration: 500ms;
		position: relative;
		margin-inline: 8px;
		height: var(--control-height-md);
	}

	.ui-double-range__input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: var(--control-height-md);
		margin: 0;
		border: 0;
		background: transparent;
		pointer-events: none;
		appearance: none;
		outline: none;
	}

	.ui-double-range__input::-webkit-slider-runnable-track {
		background: transparent;
	}

	.ui-double-range__input::-webkit-slider-thumb {
		width: 16px;
		height: 16px;
		border: 0;
		background: transparent;
		opacity: 0;
		appearance: none;
	}

	.ui-double-range__input--minimum {
		z-index: 2;
	}

	.ui-double-range__input--maximum {
		z-index: 1;
	}

	.ui-double-range__input:disabled {
		opacity: 0.5;
	}

	.ui-double-range__control.dragging {
		--range-duration: 0ms;
	}

	@media (prefers-reduced-motion: reduce) {
		.ui-double-range__control {
			--range-duration: 0ms;
		}
	}
</style>
