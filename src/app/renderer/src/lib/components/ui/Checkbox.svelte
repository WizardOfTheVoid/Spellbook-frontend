<script lang="ts">
	import { createControlId } from "$lib/utils/controlIds";
	import Icon from "./Icon.svelte";

	export let checked = false;
	export let label: string;
	export let description: string | null = null;
	export let id: string | null = null;
	export let disabled = false;
	export let indeterminate = false;
	export let onChange: ((checked: boolean) => void) | null = null;

	let input: HTMLInputElement;
	const generatedId = createControlId("checkbox");

	$: controlId = id ?? generatedId;
	$: if (input) input.indeterminate = indeterminate;
</script>

<label
	class="ui-checkbox"
	class:ui-checkbox--disabled={disabled}
	for={controlId}
>
	<input
		bind:this={input}
		id={controlId}
		type="checkbox"
		data-uisfx={checked ? "uncheck" : "check"}
		{checked}
		{disabled}
		on:change={(event) => onChange?.(event.currentTarget.checked)}
	/>
	<span class="ui-checkbox__mark" aria-hidden="true">
		{#if indeterminate}
			<Icon name="fa-minus" size="sm" type="solid" />
		{:else if checked}
			<Icon name="fa-check" size="sm" type="solid" />
		{/if}
	</span>
	<span class="ui-checkbox__copy">
		<strong>{label}</strong>
		{#if description}<small>{description}</small>{/if}
	</span>
</label>

<style lang="scss">
	.ui-checkbox {
		min-width: 0;
		display: inline-grid;
		grid-template-columns: 20px minmax(0, 1fr);
		align-items: center;
		gap: var(--gutter-sm);
		color: var(--color-light-secondary);
		cursor: pointer;
	}

	input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.ui-checkbox__mark {
		width: 18px;
		height: 18px;
		display: inline-grid;
		place-items: center;
		border: 1px solid var(--color-dark-tertiary);
		border-radius: calc(var(--radius) / 2);
		color: var(--color-light-primary);
		background: transparent;
		transition: all var(--motion-fast) var(--motion-ease);
	}

	input:checked + .ui-checkbox__mark,
	input:indeterminate + .ui-checkbox__mark {
		border-color: var(--color-accent-primary);
		background: var(--color-accent-primary);
	}

	input:focus-visible + .ui-checkbox__mark {
		outline: 2px solid var(--color-accent-primary);
		outline-offset: 2px;
	}

	.ui-checkbox__copy {
		min-width: 0;
		display: grid;
		gap: 2px;
	}

	strong {
		font-size: var(--font-size-md);
		font-weight: var(--font-weight);
	}

	small {
		color: var(--color-light-tertiary);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight);
	}

	.ui-checkbox--disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
</style>
