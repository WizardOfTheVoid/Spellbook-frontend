<script lang="ts">
	import { createControlId } from "$lib/utils/controlIds";
	import { tooltip as tooltipAction } from "$lib/utils/tooltip"

	export let checked = false;
	export let label: string;
	export let description: string | null = null;
	export let tooltip: string | null = null
	export let id: string | null = null;
	export let disabled = false;
	export let showLabel = true;
	export let onChange: ((checked: boolean) => void) | null = null;

	const generatedId = createControlId("toggle");

	$: controlId = id ?? generatedId;
</script>

<label
	class="ui-toggle"
	class:ui-toggle--compact={!showLabel}
	class:ui-toggle--disabled={disabled}
	for={controlId}
	use:tooltipAction={tooltip ?? ""}
>
	<span class:visually-hidden={!showLabel} class="ui-toggle__copy">
		<strong>{label}</strong>
		{#if description}<small>{description}</small>{/if}
	</span>
	<input
		id={controlId}
		type="checkbox"
		role="switch"
		data-uisfx={checked ? "toggle-off" : "toggle-on"}
		{checked}
		{disabled}
		on:change={(event) => onChange?.(event.currentTarget.checked)}
	/>
	<span class="ui-toggle__track" aria-hidden="true">
		<span></span>
	</span>
</label>

<style lang="scss">
	.ui-toggle {
		min-width: 0;
		display: inline-grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--gutter-md);
		color: var(--color-light-secondary);
		cursor: pointer;
	}

	.ui-toggle__copy {
		min-width: 0;
		display: grid;
		gap: 2px;
	}

	.ui-toggle--compact {
		display: inline-flex;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
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

	input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.ui-toggle__track {
		width: 44px;
		height: 24px;
		display: flex;
		align-items: center;
		border: 1px solid var(--color-dark-tertiary);
		border-radius: 999px;
		padding: 2px;
		background: var(--color-dark-secondary);
		transition: all var(--motion-fast) var(--motion-ease);
	}

	.ui-toggle__track span {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: var(--color-light-secondary);
		transition: transform var(--motion-fast) var(--motion-ease);
	}

	input:checked + .ui-toggle__track {
		border-color: var(--color-accent-primary);
		background: rgbaa(var(--color-accent-primary), 0.35);
	}

	input:checked + .ui-toggle__track span {
		background: var(--color-accent-primary);
		transform: translateX(20px);
	}

	input:focus-visible + .ui-toggle__track {
		outline: 2px solid var(--color-accent-primary);
		outline-offset: 2px;
	}

	.ui-toggle--disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
</style>
