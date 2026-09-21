<script lang="ts">
	import { createRangeScale } from './range/rangeScale'
	import RangeTicks from './range/rangeTicks.svelte'
	import RangeTrack from './range/rangeTrack.svelte'
	import RangeThumb from './range/rangeThumb.svelte'
	import { createControlId } from "$lib/utils/controlIds";
	import { rangeSfxVolume } from "$lib/global/sfx/sfx-settings";
	import { tooltip as tooltipAction } from "$lib/utils/tooltip";

	export let value = 0;
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
	export let onChange: ((value: number) => void) | null = null;

	let control: HTMLDivElement;
	let controlWidth = 0
	let input: HTMLInputElement;
	let dragging = false;
	const generatedId = createControlId("range");

	$: currentValueFormatter = formatCurrentValue ?? formatValue
	$: accessibleLabel = label || ariaLabel
	$: controlId = id ?? generatedId;
	$: naturalSpacing = ($$restProps[`natural-step-spacing`] ?? naturalStepSpacing) === true
	$: scale = createRangeScale(min, max, step, steps, naturalSpacing, controlWidth)
	$: allowCustomValue = ($$restProps[`allow-out-of-step`] ?? allowOutOfStep) === true
	$: progress = scale.progress(value)

	function setFromPointer(clientX: number): void {
		const bounds = control.getBoundingClientRect();
		const ratio = Math.min(
			1,
			Math.max(0, (clientX - bounds.left) / bounds.width),
		);
		setValue(scale.fromRatio(ratio))
	}

	function setValue(nextValue: number): void {
		if (disabled) return
		nextValue = scale.snap(nextValue, allowCustomValue)
		if (nextValue === value) return;
		SFX.play(`volume-change`, { volume: rangeSfxVolume(nextValue, scale.min, scale.max) })
		onChange?.(nextValue);
	}
</script>

<div class="ui-range" use:tooltipAction={tooltip ?? ""}>
	{#if label}
	<span class="ui-range__header">
		<label for={controlId}>{label}</label>
	</span>
	{/if}
	<div bind:this={control} bind:clientWidth={controlWidth} class="ui-range__control" class:dragging>
		<RangeTrack end={progress} {disabled} />
		<input
			bind:this={input}
			id={controlId}
			type="range"
			aria-label={accessibleLabel}
			min={scale.inputMin}
			max={scale.inputMax}
			step={scale.inputStep}
			value={scale.toInput(value)}
			{disabled}
			aria-valuemin={scale.min}
			aria-valuemax={scale.max}
			aria-valuenow={value}
			aria-valuetext={currentValueFormatter(value)}
			on:input={(event) => setValue(scale.fromInput(event.currentTarget.valueAsNumber))}
			on:pointerdown={(event) => {
				if (!naturalSpacing || !steps.length || disabled || event.button !== 0) return
				event.preventDefault()
				input.focus()
				input.setPointerCapture(event.pointerId)
				dragging = true
				setFromPointer(event.clientX)
			}}
			on:pointermove={(event) => { if (dragging && input.hasPointerCapture(event.pointerId)) setFromPointer(event.clientX) }}
			on:pointerup={() => dragging = false}
			on:pointercancel={() => dragging = false}
			on:lostpointercapture={() => dragging = false}
		/>
		<RangeTicks label={accessibleLabel} onSelect={(index) => setValue(scale.tickValues[index])} positions={scale.ticks} labels={scale.tickValues.map(formatValue)} values={scale.tickValues} selectedValues={[value]} {disabled} />
		<RangeThumb {value} label={accessibleLabel} {disabled} formatValue={currentValueFormatter} position={progress} hasSteps={scale.ticks.length > 0}
			onChange={setValue} onMove={setFromPointer} onFocus={() => input.focus()} onDragChange={(active) => dragging = active} />
	</div>
</div>

<style lang="scss">
	.ui-range {
		min-width: 0;
		display: grid;
		gap: var(--gutter-sm);
		color: var(--color-light-secondary);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
	}

	.ui-range__header {
		display: flex;
		justify-content: space-between;
		gap: var(--gutter-md);
	}

	.ui-range__control {
		--range-duration: 500ms;
		position: relative;
		margin-inline: 8px;
		height: var(--control-height-md);
	}

	input {
		width: 100%;
		height: var(--control-height-md);
		margin: 0;
		border: 0;
		outline: none;
		background: transparent;
		appearance: none;
		cursor: pointer;
	}

	input::-webkit-slider-runnable-track {
		height: 4px;
		border-radius: 999px;
		background: transparent;
	}

	input::-webkit-slider-thumb {
		width: 16px;
		height: 16px;
		margin-top: -6px;
		border: 0;
		background: transparent;
		opacity: 0;
		appearance: none;
	}

	input:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.ui-range__control.dragging,
	.ui-range__control:has(input:active) {
		--range-duration: 0ms;
	}

	@media (prefers-reduced-motion: reduce) {
		.ui-range__control {
			--range-duration: 0ms;
		}
	}
</style>
