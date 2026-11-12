<script lang="ts">
	import RangeValue from './rangeValue.svelte'
	import { RangeGesture } from './rangeInteraction'

	export let value: number
	export let position: number
	export let label: string
	export let disabled = false
	export let hasSteps = false
	export let row = 0
	export let formatValue: (value: number) => string
	export let onChange: (value: number) => void
	export let onMove: (clientX: number) => void
	export let onFocus: () => void
	export let onDragChange: (dragging: boolean) => void
	let editor: RangeValue
	let hovered = false
	let dragging = false
	const gesture = new RangeGesture()

	export function startEditing() {
		editor.startEditing()
	}

	function start(event: PointerEvent) {
		if (disabled || event.button !== 0) return
		event.preventDefault()
		onFocus()
		gesture.start(event)
		const thumb = event.currentTarget as HTMLButtonElement
		thumb.setPointerCapture(event.pointerId)
	}

	function move(event: PointerEvent) {
		if (!gesture.move(event)) return
		dragging = true
		onDragChange(true)
		onMove(event.clientX)
	}

	function cancel() {
		gesture.cancel()
		dragging = false
		onDragChange(false)
	}

	function finish(event: PointerEvent) {
		const result = gesture.finish(event)
		if (!result) return
		if (result === `drag`) onMove(event.clientX)
		cancel()
		if (result === `edit`) startEditing()
	}
</script>

<RangeValue bind:this={editor} {value} {label} {disabled} {formatValue} {position} {row} {onChange} above={hasSteps} visible={!hasSteps || hovered || dragging} />
<button
	class="range-thumb"
	type="button"
	aria-label={`Adjust ${label}`}
	{disabled}
	style={`left: ${position}%`}
	on:pointerenter={() => hovered = true}
	on:pointerleave={() => hovered = false}
	on:pointerdown={start}
	on:pointermove={move}
	on:pointerup={finish}
	on:pointercancel={cancel}
	on:lostpointercapture={cancel}
	on:click={(event) => { if (event.detail === 0) startEditing() }}
></button>

<style>
	.range-thumb {
		position: absolute;
		top: 50%;
		z-index: 3;
		width: 16px;
		height: 16px;
		border: 2px solid var(--color-accent-primary);
		border-radius: 50%;
		padding: 0;
		outline: none;
		background: var(--color-dark-primary);
		box-shadow: var(--shadow);
		transform: translate(-50%, -50%);
		cursor: grab;
		touch-action: none;
		transition: left var(--range-duration) var(--easing);
	}
	.range-thumb::after {
		content: "";
		position: absolute;
		inset: -8px;
		border-radius: 50%;
	}
	.range-thumb:active { cursor: grabbing; }
	.range-thumb:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
