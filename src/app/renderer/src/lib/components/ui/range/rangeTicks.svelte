<script lang="ts">
	export let positions: number[] = []
	export let labels: string[] = []
	export let values: number[] = []
	export let selectedValues: number[] = []
	export let disabled = false
	export let label: string
	export let onSelect: (index: number) => void
</script>

<span class="range-ticks" class:disabled>
	{#each positions as position, index}
		<button type="button" class="tick" {disabled} aria-label={`Set ${label} to ${labels[index]}`} style={`left: ${position}%`} on:click={() => onSelect(index)}>
			<span class="tick-label" class:selected={selectedValues.includes(values[index])} class:first={index === 0} class:last={index === positions.length - 1}>{labels[index]}</span>
		</button>
	{/each}
</span>

<style>
	.range-ticks {
		position: absolute;
		inset: 0;
		pointer-events: none;
		container-type: inline-size;
	}

	.tick {
		position: absolute;
		top: calc(50% - 12px);
		z-index: 2;
		width: 24px;
		height: 48px;
		border: 0;
		padding: 0;
		background: transparent;
		transform: translateX(-50%);
		pointer-events: auto;
		cursor: pointer;
	}

	.tick::before {
		content: "";
		position: absolute;
		top: 8px;
		left: 50%;
		width: 1px;
		height: 8px;
		background: var(--color-light-tertiary);
	}

	.tick-label {
		position: absolute;
		top: 22px;
		left: 50%;
		transform: translateX(-50%);
		color: var(--color-light-tertiary);
		font-size: 10px;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.tick-label.first {
		transform: none;
	}

	.tick-label.last:not(.first) {
		transform: translateX(-100%);
	}

	.tick-label.selected {
		color: white;
	}

	.disabled {
		opacity: 0.5;
	}
</style>
