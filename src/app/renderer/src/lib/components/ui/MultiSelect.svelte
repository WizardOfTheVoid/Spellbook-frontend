<script lang="ts">
	import type { FormOption } from "$lib/types/ui";
	import { createControlId } from "$lib/utils/controlIds";
	import Checkbox from "./Checkbox.svelte";
	import Icon from "./Icon.svelte";

	export let value: string[] = [];
	export let label: string;
	export let options: FormOption[];
	export let id: string | null = null;
	export let placeholder = "Select options";
	export let disabled = false;
	export let onChange: ((value: string[]) => void) | null = null;

	let root: HTMLDivElement;
	let searchInput: HTMLInputElement;
	let open = false;
	let query = "";
	const generatedId = createControlId("multi-select");

	$: controlId = id ?? generatedId;
	$: selectedOptions = options.filter((option) => value.includes(option.value));
	$: enabledOptions = options.filter((option) => !option.disabled);
	$: filteredOptions = options.filter((option) =>
		option.label.toLowerCase().includes(query.trim().toLowerCase()),
	);
	$: allSelected =
		enabledOptions.length > 0 &&
		enabledOptions.every((option) => value.includes(option.value));
	$: someSelected =
		enabledOptions.some((option) => value.includes(option.value)) &&
		!allSelected;

	function focusAndOpen(event: MouseEvent): void {
		if (
			disabled ||
			(event.target instanceof Element && event.target.closest("button"))
		)
			return;
		open = true;
		searchInput.focus();
	}

	function toggleOption(option: FormOption): void {
		if (option.disabled) return;
		onChange?.(
			value.includes(option.value) ?
				value.filter((entry) => entry !== option.value)
			:	[...value, option.value],
		);
	}

	function toggleAll(checked: boolean): void {
		const disabledValues = value.filter(
			(entry) => options.find((option) => option.value === entry)?.disabled,
		);
		onChange?.(
			checked ?
				[...disabledValues, ...enabledOptions.map((option) => option.value)]
			:	disabledValues,
		);
	}

	function remove(valueToRemove: string): void {
		onChange?.(value.filter((entry) => entry !== valueToRemove));
	}

	function handleInputKeydown(event: KeyboardEvent): void {
		if (event.key === "Escape") {
			open = false;
			searchInput.blur();
		} else if (event.key === "ArrowDown") {
			open = true;
		} else if (
			event.key === "Backspace" &&
			!query &&
			selectedOptions.length > 0
		) {
			remove(selectedOptions[selectedOptions.length - 1].value);
		}
	}

	function dismiss(event: MouseEvent): void {
		if (root && event.target instanceof Node && !root.contains(event.target)) {
			open = false;
			query = "";
		}
	}
</script>

<svelte:window on:mousedown={dismiss} />

<div
	bind:this={root}
	class="ui-multi-select"
	class:ui-multi-select--disabled={disabled}
>
	<label id={`${controlId}-label`} for={`${controlId}-search`}>{label}</label>
	<div
		class="ui-multi-select__control"
		class:ui-multi-select__control--open={open}
		role="combobox"
		aria-expanded={open}
		aria-haspopup="listbox"
		aria-controls={`${controlId}-options`}
		aria-labelledby={`${controlId}-label`}
		data-uisfx={open ? undefined : "open"}
		tabindex="-1"
		on:click={focusAndOpen}
		on:keydown={() => {}}
	>
		<div class="ui-multi-select__values">
			{#each selectedOptions as option (option.value)}
				<span class="ui-multi-select__tag">
					{option.label}
					<button
						type="button"
						aria-label={`Remove ${option.label}`}
						data-uisfx="deselect"
						disabled={disabled || option.disabled}
						on:click|stopPropagation={() => remove(option.value)}
					>
						<Icon name="fa-xmark" size="sm" type="solid" />
					</button>
				</span>
			{/each}
			<input
				bind:this={searchInput}
				id={`${controlId}-search`}
				type="text"
				bind:value={query}
				placeholder={selectedOptions.length === 0 ? placeholder : ""}
				aria-label={`Search ${label}`}
				{disabled}
				on:focus={() => (open = true)}
				on:keydown={handleInputKeydown}
			/>
		</div>
		<span class="ui-multi-select__chevron" aria-hidden="true">
			<Icon
				name={open ? "fa-chevron-up" : "fa-chevron-down"}
				size="sm"
				type="solid"
			/>
		</span>
	</div>

	{#if open}
		<div
			id={`${controlId}-options`}
			class="ui-multi-select__popover"
			role="listbox"
			aria-multiselectable="true"
		>
			<div class="ui-multi-select__select-all">
				<Checkbox
					label="Select all"
					checked={allSelected}
					indeterminate={someSelected}
					onChange={toggleAll}
				/>
			</div>
			<div class="ui-multi-select__options">
				{#each filteredOptions as option (option.value)}
					<div role="option" aria-selected={value.includes(option.value)}>
						<Checkbox
							label={option.label}
							description={option.description ?? null}
							checked={value.includes(option.value)}
							disabled={option.disabled}
							onChange={() => toggleOption(option)}
						/>
					</div>
				{:else}
					<span class="ui-multi-select__empty">No matching options</span>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style lang="scss">
	.ui-multi-select {
		position: relative;
		min-width: 0;
		display: grid;
		gap: var(--gutter-sm);
		color: var(--color-light-secondary);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
	}

	.ui-multi-select__control {
		min-height: var(--control-height-md);
		box-sizing: border-box;
		display: flex;
		align-items: center;
		gap: var(--gutter-sm);
		border: 1px solid var(--color-dark-secondary);
		border-radius: var(--radius);
		padding: 2px var(--gutter-md);
		cursor: text;
	}

	.ui-multi-select__control--open,
	.ui-multi-select__control:focus-within {
		border-color: var(--color-accent-primary);
	}

	.ui-multi-select__values {
		min-width: 0;
		display: flex;
		flex: 1 1 auto;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--gutter-sm);
	}

	.ui-multi-select__tag {
		display: inline-flex;
		align-items: center;
		gap: var(--gutter-sm);
		min-height: calc(var(--control-height-sm) - var(--gutter));
		border: 1px solid var(--color-dark-tertiary);
		border-radius: var(--radius);
		padding-left: var(--gutter-sm);
		color: var(--color-light-primary);
		background: rgbaa(var(--color-dark-secondary), 0.35);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight);
	}

	.ui-multi-select__tag button {
		align-self: stretch;
		display: inline-grid;
		place-items: center;
		border: 0;
		padding: 0 var(--gutter-sm);
		color: var(--color-light-tertiary);
		background: transparent;
		cursor: pointer;
	}

	.ui-multi-select__tag button:hover {
		color: var(--color-light-primary);
	}

	.ui-multi-select__values input {
		min-width: 90px;
		height: calc(var(--control-height-md) - 6px);
		flex: 1 1 90px;
		border: 0;
		padding: 0;
		color: var(--color-light-primary);
		background: transparent;
		outline: none;
	}

	.ui-multi-select__values input::placeholder {
		color: var(--color-light-tertiary);
	}

	.ui-multi-select__chevron {
		display: inline-flex;
		pointer-events: none;
	}

	.ui-multi-select__popover {
		position: absolute;
		top: calc(100% + var(--gutter-sm));
		left: 0;
		right: 0;
		z-index: calc(var(--z-popover) + 1);
		display: grid;
		border: 1px solid var(--color-dark-secondary);
		border-radius: var(--radius);
		background: var(--color-dark-primary);
		box-shadow: var(--shadow);
		overflow: hidden;
	}

	.ui-multi-select__select-all,
	.ui-multi-select__options > [role="option"] {
		padding: var(--gutter-md);
	}

	.ui-multi-select__options > [role="option"] {
		border-radius: var(--radius);
	}

	.ui-multi-select__select-all {
		border-bottom: 1px solid var(--color-dark-secondary);
	}

	.ui-multi-select__options {
		max-height: var(--select-menu-max-height);
		display: grid;
		gap: var(--gutter-sm);
		padding: var(--gutter-sm);
		overflow-y: auto;
	}

	.ui-multi-select__options > [role="option"]:hover {
		background: rgbaa(var(--color-dark-secondary), 0.35);
	}

	.ui-multi-select__empty {
		padding: var(--gutter-lg);
		color: var(--color-light-tertiary);
		font-weight: var(--font-weight);
		text-align: center;
	}

	.ui-multi-select--disabled {
		opacity: 0.5;
	}
</style>
