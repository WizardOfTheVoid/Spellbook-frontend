<script lang="ts">
	import { createControlId } from "$lib/utils/controlIds";
	import { tooltip as tooltipAction } from "$lib/utils/tooltip";

	export let value = "";
	export let label: string;
	export let id: string | null = null;
	export let hint: string | null = null;
	export let tooltip: string | null = null;
	export let min: string | null = null;
	export let max: string | null = null;
	export let disabled = false;
	export let required = false;
	export let onChange: ((value: string) => void) | null = null;

	const generatedId = createControlId("date");

	$: controlId = id ?? generatedId;
</script>

<label class="ui-date-input" for={controlId} use:tooltipAction={tooltip ?? ""}>
	<span>{label}</span>
	<input
		id={controlId}
		type="date"
		{value}
		min={min ?? undefined}
		max={max ?? undefined}
		{disabled}
		{required}
		on:input={(event) => onChange?.(event.currentTarget.value)}
	/>
	{#if hint}<small>{hint}</small>{/if}
</label>

<style lang="scss">
	.ui-date-input {
		min-width: 0;
		display: grid;
		gap: var(--gutter-sm);
		color: var(--color-light-secondary);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
	}

	input {
		width: 100%;
		min-width: 0;
		height: var(--control-height-md);
		box-sizing: border-box;
		border: 1px solid var(--color-dark-secondary);
		border-radius: var(--radius);
		padding: 0 var(--gutter-md);
		color: var(--color-light-primary);
		background: transparent;
		color-scheme: dark;
		outline: none;
	}

	input:focus {
		border-color: var(--color-accent-primary);
	}

	input:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	small {
		color: var(--color-light-tertiary);
		font-weight: var(--font-weight);
	}
</style>
