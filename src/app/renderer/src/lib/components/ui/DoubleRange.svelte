<script lang="ts">
	import { createControlId } from "$lib/utils/controlIds";
	import { rangeSfxVolume } from "$lib/global/sfx/sfx-settings";
	import { tooltip as tooltipAction } from "$lib/utils/tooltip";

	export let minimumValue: number;
	export let maximumValue: number;
	export let label: string;
	export let id: string | null = null;
	export let min = 0;
	export let max = 100;
	export let step = 1;
	export let disabled = false;
	export let tooltip: string | null = null;
	export let formatValue: (value: number) => string = (current) => `${current}`;
	export let onChange: ((minimum: number, maximum: number) => void) | null =
		null;

	let control: HTMLDivElement;
	let minimumInput: HTMLInputElement;
	let maximumInput: HTMLInputElement;
	let dragging: "minimum" | "maximum" | null = null;
	const generatedId = createControlId("double-range");

	$: controlId = id ?? generatedId;
	$: start = max === min ? 0 : ((minimumValue - min) / (max - min)) * 100;
	$: end = max === min ? 100 : ((maximumValue - min) / (max - min)) * 100;

	function setMinimum(value: number): void {
		const nextValue = Math.min(value, maximumValue);
		if (nextValue === minimumValue) return;
		SFX.play("volume-change", { volume: rangeSfxVolume(nextValue, min, max) });
		onChange?.(nextValue, maximumValue);
	}

	function setMaximum(value: number): void {
		const nextValue = Math.max(value, minimumValue);
		if (nextValue === maximumValue) return;
		SFX.play("volume-change", { volume: rangeSfxVolume(nextValue, min, max) });
		onChange?.(minimumValue, nextValue);
	}

	function startDrag(event: PointerEvent, handle: "minimum" | "maximum"): void {
		if (disabled) return;
		event.preventDefault();
		dragging = handle;
		(handle === "minimum" ? minimumInput : maximumInput).focus();
		(event.currentTarget as HTMLButtonElement).setPointerCapture(
			event.pointerId,
		);
		setFromPointer(event.clientX, handle);
	}

	function drag(event: PointerEvent): void {
		if (dragging) setFromPointer(event.clientX, dragging);
	}

	function stopDrag(): void {
		dragging = null;
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
		const stepped = min + Math.round((ratio * (max - min)) / step) * step;
		const nextValue = Math.min(max, Math.max(min, Number(stepped.toFixed(10))));
		if (handle === "minimum") setMinimum(nextValue);
		else setMaximum(nextValue);
	}
</script>

<fieldset class="ui-double-range" use:tooltipAction={tooltip ?? ""}>
	<legend class="ui-double-range__header">
		<span>{label}</span>
		<output>
			{formatValue(minimumValue)} - {formatValue(maximumValue)}
		</output>
	</legend>
	<div
		bind:this={control}
		class="ui-double-range__control"
		style={`--range-start: ${start}%; --range-end: ${end}%`}
	>
		<span class="ui-double-range__track" aria-hidden="true"></span>
		<input
			bind:this={minimumInput}
			id={`${controlId}-minimum`}
			class="ui-double-range__input ui-double-range__input--minimum"
			type="range"
			{min}
			{max}
			{step}
			value={minimumValue}
			{disabled}
			aria-label={`Minimum ${label}`}
			aria-valuetext={formatValue(minimumValue)}
			on:input={(event) => setMinimum(event.currentTarget.valueAsNumber)}
		/>
		<input
			bind:this={maximumInput}
			id={`${controlId}-maximum`}
			class="ui-double-range__input ui-double-range__input--maximum"
			type="range"
			{min}
			{max}
			{step}
			value={maximumValue}
			{disabled}
			aria-label={`Maximum ${label}`}
			aria-valuetext={formatValue(maximumValue)}
			on:input={(event) => setMaximum(event.currentTarget.valueAsNumber)}
		/>
		<button
			class="ui-double-range__thumb ui-double-range__thumb--minimum"
			type="button"
			tabindex="-1"
			aria-label={`Adjust minimum ${label}`}
			{disabled}
			style={`left: ${start}%`}
			on:pointerdown={(event) => startDrag(event, "minimum")}
			on:pointermove={drag}
			on:pointerup={stopDrag}
			on:pointercancel={stopDrag}
		></button>
		<button
			class="ui-double-range__thumb ui-double-range__thumb--maximum"
			type="button"
			tabindex="-1"
			aria-label={`Adjust maximum ${label}`}
			{disabled}
			style={`left: ${end}%`}
			on:pointerdown={(event) => startDrag(event, "maximum")}
			on:pointermove={drag}
			on:pointerup={stopDrag}
			on:pointercancel={stopDrag}
		></button>
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
		width: 100%;
		display: flex;
		justify-content: space-between;
		gap: var(--gutter-md);
		padding: 0;
	}

	output {
		color: var(--color-light-tertiary);
		font-variant-numeric: tabular-nums;
	}

	.ui-double-range__control {
		position: relative;
		height: 32px;
	}

	.ui-double-range__track {
		position: absolute;
		top: 14px;
		left: 0;
		right: 0;
		height: 4px;
		border-radius: 999px;
		background: linear-gradient(
			to right,
			var(--color-dark-secondary) 0 var(--range-start),
			var(--color-accent-primary) var(--range-start) var(--range-end),
			var(--color-dark-secondary) var(--range-end) 100%
		);
	}

	.ui-double-range__input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 32px;
		margin: 0;
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

	.ui-double-range__thumb {
		position: absolute;
		top: 50%;
		z-index: 3;
		width: 16px;
		height: 16px;
		border: 2px solid var(--color-accent-primary);
		border-radius: 50%;
		padding: 0;
		background: var(--color-dark-primary);
		box-shadow: var(--shadow);
		transform: translate(-50%, -50%);
		cursor: grab;
	}

	.ui-double-range__thumb::after {
		content: "";
		position: absolute;
		inset: -8px;
		border-radius: 50%;
	}

	.ui-double-range__thumb:active {
		cursor: grabbing;
	}

	.ui-double-range__input--minimum:focus-visible
		~ .ui-double-range__thumb--minimum,
	.ui-double-range__input--maximum:focus-visible
		~ .ui-double-range__thumb--maximum {
		outline: 2px solid var(--color-accent-primary);
		outline-offset: 3px;
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
</style>
