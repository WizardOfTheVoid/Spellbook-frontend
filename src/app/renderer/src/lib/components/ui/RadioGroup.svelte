<script lang="ts">
	import type { FormOption } from "$lib/types/ui";
	import { createControlId } from "$lib/utils/controlIds";

	export let value = "";
	export let label: string;
	export let options: FormOption[];
	export let id: string | null = null;
	export let disabled = false;
	export let orientation: "horizontal" | "vertical" = "horizontal";
	export let onChange: ((value: string) => void) | null = null;

	const generatedId = createControlId("radio");

	$: groupId = id ?? generatedId;
</script>

<fieldset
	class="ui-radio-group"
	class:ui-radio-group--vertical={orientation === "vertical"}
>
	<legend>{label}</legend>
	<div class="ui-radio-group__options">
		{#each options as option (option.value)}
			<label
				class="ui-radio"
				class:ui-radio--disabled={disabled || option.disabled}
			>
				<input
					type="radio"
					name={groupId}
					value={option.value}
					data-uisfx="select"
					checked={value === option.value}
					disabled={disabled || option.disabled}
					on:change={() => onChange?.(option.value)}
				/>
				<span class="ui-radio__mark" aria-hidden="true"></span>
				<span class="ui-radio__copy">
					<strong>{option.label}</strong>
					{#if option.description}<small>{option.description}</small>{/if}
				</span>
			</label>
		{/each}
	</div>
</fieldset>

<style lang="scss">
	.ui-radio-group {
		min-width: 0;
		display: grid;
		gap: var(--gutter-sm);
		border: 0;
		padding: 0;
		color: var(--color-light-secondary);
	}

	legend {
		margin-bottom: var(--gutter-sm);
		padding: 0;
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
	}

	.ui-radio-group__options {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gutter-md);
	}

	.ui-radio-group--vertical .ui-radio-group__options {
		display: grid;
	}

	.ui-radio {
		min-width: 0;
		display: inline-grid;
		grid-template-columns: 20px minmax(0, 1fr);
		align-items: center;
		gap: var(--gutter-sm);
		cursor: pointer;
	}

	input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.ui-radio__mark {
		width: 18px;
		height: 18px;
		box-sizing: border-box;
		border: 1px solid var(--color-dark-tertiary);
		border-radius: 50%;
		box-shadow: inset 0 0 0 4px transparent;
		transition: all var(--motion-fast) var(--motion-ease);
	}

	input:checked + .ui-radio__mark {
		border-color: var(--color-accent-primary);
		background: var(--color-accent-primary);
		box-shadow: inset 0 0 0 4px var(--color-dark-primary);
	}

	input:focus-visible + .ui-radio__mark {
		outline: 2px solid var(--color-accent-primary);
		outline-offset: 2px;
	}

	.ui-radio__copy {
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

	.ui-radio--disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
</style>
