<script lang="ts">
	import type { FormOption } from "$lib/types/ui";
	import { createControlId } from "$lib/utils/controlIds";
	import { tooltip } from "$lib/utils/tooltip";
	import Checkbox from "./Checkbox.svelte";
	import Icon from "./Icon.svelte";
	import { selectOnlySearchResult } from './selectSearch'
	import { allMultiSelectValues, toggleMultiSelectValue } from './multiSelectSelection'
	import { floatMultiSelect } from './multiSelectFloating'

	export let value: string[] = [];
	export let label: string | null = null;
	export let ariaLabel: string | null = null;
	export let options: FormOption[];
	export let id: string | null = null;
	export let placeholder = "Select options";
	export let disabled = false;
	export let error: string | null = null
	export let compact = false
	export let floatingMenu = false
	export let selectionLabel: string | null = null
	export let showSelectAll = true
	export let maxSelections = Infinity
	export let onChange: ((value: string[]) => void) | null = null;

	let root: HTMLDivElement;
	let searchInput: HTMLInputElement;
	let open = false;
	let pointerWasOpen: boolean | null = null
	let query = "";
	const generatedId = createControlId("multi-select");

	$: controlId = id ?? generatedId;
	$: hasLabel = Boolean(label?.trim());
	$: accessibleLabel =
		ariaLabel?.trim() ||
		label?.trim() ||
		placeholder?.trim() ||
		`Select options`;
	$: selectedOptions = options.filter((option) => value.includes(option.value));
	$: enabledOptions = options.filter((option) => !option.disabled);
	$: filteredOptions = options.map(option => ({ ...option, disabled: option.disabled || (value.length >= maxSelections && !value.includes(option.value)) })).filter((option) =>
		`${option.group ?? ``} ${option.label}`.toLowerCase().includes(query.trim().toLowerCase()),
	);
	$: allSelected =
		enabledOptions.length > 0 &&
		enabledOptions.filter(option => value.includes(option.value)).length >= Math.min(enabledOptions.length, maxSelections)
	$: someSelected =
		enabledOptions.some((option) => value.includes(option.value)) &&
		!allSelected;

	export function close(): boolean {
		const wasOpen = open
		open = false
		query = ``
		return wasOpen
	}

	function openMenu(): void {
		if (disabled || open) return
		open = true
		if (typeof SFX !== `undefined`) SFX.play(`open`)
	}

	function handleEscape(event: KeyboardEvent): void {
		if (event.key !== `Escape` || !open) return
		event.preventDefault()
		event.stopPropagation()
		searchInput.focus()
		close()
	}

	function focusAndToggle(event: MouseEvent): void {
		const wasOpen = pointerWasOpen ?? open
		pointerWasOpen = null
		if (
			disabled ||
			(event.target instanceof Element && event.target.closest("button"))
		)
			return;
		searchInput.focus()
		if (wasOpen) {
			close()
			if (typeof SFX !== `undefined`) SFX.play(`close`)
		} else openMenu()
	}

	function toggleOption(option: FormOption): void {
		if (option.disabled) return
		onChange?.(toggleMultiSelectValue(value, option, maxSelections))
	}

	function toggleAll(checked: boolean): void {
		onChange?.(allMultiSelectValues(value, options, checked, maxSelections))
	}

	function remove(valueToRemove: string): void {
		onChange?.(value.filter((entry) => entry !== valueToRemove));
	}

	function handleInputKeydown(event: KeyboardEvent): void {
		if (open && !disabled && selectOnlySearchResult(event, filteredOptions, option => {
			if (!value.includes(option.value)) toggleOption(option)
			close()
		})) return
		if (event.key === "ArrowDown") {
			openMenu()
		} else if (
			event.key === "Backspace" &&
			!query && !compact &&
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
	class:ui-multi-select--compact={compact}
>
	{#if hasLabel}<label id={`${controlId}-label`} for={`${controlId}-search`}
			>{label}</label
		>{/if}
	<div
		class="ui-multi-select__control"
		class:ui-multi-select__control--open={open}
		class:ui-multi-select__control--invalid={error}
		role="combobox"
		aria-expanded={open}
		aria-haspopup="listbox"
		aria-controls={`${controlId}-options`}
		aria-labelledby={hasLabel && !ariaLabel ? `${controlId}-label` : undefined}
		aria-label={!hasLabel || ariaLabel ? accessibleLabel : undefined}
		data-uisfx-ignore="true"
		tabindex="-1"
		on:pointerdown={() => pointerWasOpen = open}
		on:click={focusAndToggle}
		on:keydown={handleEscape}
	>
		<div class="ui-multi-select__values">
			{#if !compact}{#each selectedOptions as option (option.value)}
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
			{/each}{/if}
			<input
				bind:this={searchInput}
				id={`${controlId}-search`}
				type="text"
				bind:value={query}
				placeholder={compact ? selectionLabel ?? (selectedOptions.length ? `${selectedOptions.length} selected` : placeholder) : selectedOptions.length === 0 ? placeholder : ``}
				aria-label={`Search ${accessibleLabel}`}
				aria-invalid={error ? `true` : undefined}
				aria-describedby={error ? `${controlId}-error` : undefined}
				{disabled}
				on:focus={openMenu}
				on:input={openMenu}
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

	{#if error}<small id={`${controlId}-error`} class="field-error">{error}</small>{/if}
	{#if open}
		<div
			id={`${controlId}-options`}
			class="ui-multi-select__popover"
			class:ui-multi-select__popover--floating={floatingMenu}
			popover={floatingMenu ? `manual` : undefined}
			use:floatMultiSelect={floatingMenu}
			role="listbox"
			aria-multiselectable="true"
			tabindex="-1"
			on:keydown={handleEscape}
		>
			{#if $$slots.shortcuts}<div class="ui-multi-select__shortcuts"><slot name="shortcuts" /></div>{/if}
			{#if showSelectAll}<div class="ui-multi-select__select-all">
				<Checkbox
					label={enabledOptions.length > maxSelections ? `Select up to ${maxSelections}` : `Select all`}
					checked={allSelected}
					indeterminate={someSelected}
					onChange={toggleAll}
				/>
			</div>{/if}
			<div class="ui-multi-select__options">
				{#each filteredOptions as option, index (option.value)}
					{#if option.group && (option.groupId ?? option.group) !== (filteredOptions[index - 1]?.groupId ?? filteredOptions[index - 1]?.group)}
						<div class="ui-multi-select__group" role="presentation">{option.group}</div>
					{/if}
					<div
						role="option"
						aria-selected={value.includes(option.value)}
						use:tooltip={option.tooltip ?? ``}
					>
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
	.ui-multi-select--compact .ui-multi-select__values { padding-top: 0; }
	.ui-multi-select--compact .ui-multi-select__values input { min-width: 0; width: 100%; }
	.ui-multi-select--compact .ui-multi-select__values input::placeholder { color: var(--color-light-secondary); }
	.ui-multi-select__shortcuts { padding: var(--gutter-sm); border-bottom: 1px solid var(--color-dark-secondary); }
	.ui-multi-select__group { padding: var(--gutter-sm) var(--gutter-md); color: var(--color-light-tertiary); font-size: var(--font-size-xs); }
	.ui-multi-select__group:not(:first-child) { border-top: 1px solid var(--color-dark-secondary); }
	.ui-multi-select__control.ui-multi-select__control--invalid { border-color: var(--color-danger); }
	.field-error { color: var(--color-danger); }
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
		cursor: pointer;
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
		padding-top: var(--gutter-sm);
	}

	.ui-multi-select__tag {
		display: inline-flex;
		align-items: center;
		gap: var(--gutter-sm);
		min-height: calc(var(--control-height-md) - calc(var(--gutter) * 1.25));
		border: 1px solid var(--color-dark-tertiary);
		border-radius: var(--radius);
		padding-left: var(--gutter-sm);
		color: var(--color-light-primary);
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
	.ui-multi-select__values input { cursor: pointer; }
	.ui-multi-select__control--open input:focus { cursor: text; }
	.ui-multi-select--disabled :is(.ui-multi-select__control, input) { cursor: not-allowed; }

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

	.ui-multi-select__popover--floating {
		position: fixed;
		inset: auto;
		margin: 0;
		padding: 0;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		max-height: calc(100dvh - var(--gutter) * 2);
	}
	.ui-multi-select__popover--floating .ui-multi-select__options { flex: 1; min-height: 0; }
	.ui-multi-select__popover--floating :is(.ui-multi-select__shortcuts, .ui-multi-select__select-all) { flex-shrink: 0; }

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
