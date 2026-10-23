<script lang="ts">
	export let start = 0
	export let end: number
	export let disabled = false
</script>

<span class="range-track" class:disabled aria-hidden="true">
	<span class="fill" style={`left: ${start}%; right: ${100 - end}%`}></span>
</span>

<style>
	.range-track {
		position: absolute;
		top: calc(50% - 2px);
		left: 0;
		right: 0;
		height: 4px;
		border-radius: 999px;
		background: var(--color-dark-secondary);
		pointer-events: none;
	}

	.fill {
		position: absolute;
		inset-block: 0;
		border-radius: inherit;
		background: var(--color-accent-primary);
		transition:
			left var(--range-duration) var(--easing),
			right var(--range-duration) var(--easing);
	}

	.disabled {
		opacity: 0.5;
	}
</style>
