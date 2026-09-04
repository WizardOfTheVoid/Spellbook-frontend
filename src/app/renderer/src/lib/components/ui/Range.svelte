<script lang="ts">
	import { createControlId } from "$lib/utils/controlIds";
	import { rangeSfxVolume } from "$lib/global/sfx/sfx-settings";
	import { tooltip as tooltipAction } from "$lib/utils/tooltip";

	export let value = 0;
	export let label: string;
	export let id: string | null = null;
	export let min = 0;
	export let max = 100;
	export let step = 1;
	export let disabled = false;
	export let tooltip: string | null = null;
	export let formatValue: (value: number) => string = (current) => `${current}`;
	export let onChange: ((value: number) => void) | null = null;

	let control: HTMLDivElement;
	let input: HTMLInputElement;
	let dragging = false;
	const generatedId = createControlId("range");

	$: controlId = id ?? generatedId;
	$: progress = max === min ? 0 : ((value - min) / (max - min)) * 100;

	function startDrag(event: PointerEvent): void {
		if (disabled) return;
		event.preventDefault();
		dragging = true;
		input.focus();
		(event.currentTarget as HTMLButtonElement).setPointerCapture(
			event.pointerId,
		);
		setFromPointer(event.clientX);
	}

	function drag(event: PointerEvent): void {
		if (dragging) setFromPointer(event.clientX);
	}

	function stopDrag(): void {
		dragging = false;
	}

	function setFromPointer(clientX: number): void {
		const bounds = control.getBoundingClientRect();
		const ratio = Math.min(
			1,
			Math.max(0, (clientX - bounds.left) / bounds.width),
		);
		const stepped = min + Math.round((ratio * (max - min)) / step) * step;
		setValue(Math.min(max, Math.max(min, Number(stepped.toFixed(10)))));
	}

	function setValue(nextValue: number): void {
		if (nextValue === value) return;
		SFX.play("volume-change", { volume: rangeSfxVolume(nextValue, min, max) });
		onChange?.(nextValue);
	}
</script>

<div class="ui-range" use:tooltipAction={tooltip ?? ""}>
	<span class="ui-range__header">
		<label for={controlId}>{label}</label>
		<output for={controlId}>{formatValue(value)}</output>
	</span>
	<div bind:this={control} class="ui-range__control">
		<input
			bind:this={input}
			id={controlId}
			type="range"
			{min}
			{max}
			{step}
			{value}
			{disabled}
			aria-valuetext={formatValue(value)}
			style={`--range-progress: ${progress}%`}
			on:input={(event) => setValue(event.currentTarget.valueAsNumber)}
		/>
		<button
			class="ui-range__thumb"
			type="button"
			tabindex="-1"
			aria-label={`Adjust ${label}`}
			{disabled}
			style={`left: ${progress}%`}
			on:pointerdown={startDrag}
			on:pointermove={drag}
			on:pointerup={stopDrag}
			on:pointercancel={stopDrag}
		></button>
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

	output {
		color: var(--color-light-tertiary);
		font-variant-numeric: tabular-nums;
	}

	.ui-range__control {
		position: relative;
		height: 32px;
	}

	input {
		width: 100%;
		height: 32px;
		margin: 0;
		background: transparent;
		appearance: none;
		cursor: pointer;
	}

	input::-webkit-slider-runnable-track {
		height: 4px;
		border-radius: 999px;
		background: linear-gradient(
			to right,
			var(--color-accent-primary) 0 var(--range-progress),
			var(--color-dark-secondary) var(--range-progress) 100%
		);
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

	.ui-range__thumb {
		position: absolute;
		top: 50%;
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

	.ui-range__thumb::after {
		content: "";
		position: absolute;
		inset: -8px;
		border-radius: 50%;
	}

	.ui-range__thumb:active {
		cursor: grabbing;
	}

	input:focus-visible + .ui-range__thumb {
		outline: 2px solid var(--color-accent-primary);
		outline-offset: 3px;
	}

	input:focus-visible {
		outline: none;
	}

	input:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
</style>
