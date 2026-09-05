<script lang="ts">
	import { tick } from "svelte";
	import type { FormOption } from "$lib/types/ui";
	import { createControlId } from "$lib/utils/controlIds";
	import { tooltip as tooltipAction } from "$lib/utils/tooltip";
	import Icon from "./Icon.svelte";

	export let value = "";
	export let label: string;
	export let options: FormOption[];
	export let id: string | null = null;
	export let placeholder: string | null = null;
	export let hint: string | null = null;
	export let tooltip: string | null = null;
	export let disabled = false;
	export let showLabel = true;
	export let inlineMenu = false
	export let onChange: ((value: string) => void) | null = null;

	let root: HTMLDivElement;
	let trigger: HTMLButtonElement;
	let open = false;
	let activeIndex = -1;
	const generatedId = createControlId("select");

	$: controlId = id ?? generatedId;
	$: selectedOption = options.find((option) => option.value === value) ?? null;

	function selectOption(option: FormOption): void {
		if (option.disabled) return;
		onChange?.(option.value);
		close();
		trigger.focus();
	}

	function close(): void {
		open = false;
		activeIndex = -1;
	}

	function toggle(): void {
		if (disabled) return;
		if (open) {
			close();
			return;
		}
		void openAtSelected();
	}

	async function openAtSelected(): Promise<void> {
		open = true;
		activeIndex = Math.max(
			0,
			options.findIndex((option) => option.value === value && !option.disabled),
		);
		if (options[activeIndex]?.disabled) moveActive(1);
		await focusActiveOption();
	}

	function moveActive(direction: -1 | 1): void {
		if (options.length === 0) return;
		let nextIndex = activeIndex;
		for (let attempts = 0; attempts < options.length; attempts += 1) {
			nextIndex = (nextIndex + direction + options.length) % options.length;
			if (!options[nextIndex].disabled) {
				activeIndex = nextIndex;
				void focusActiveOption();
				return;
			}
		}
	}

	async function focusActiveOption(): Promise<void> {
		await tick();
		root
			?.querySelector<HTMLButtonElement>(`[data-option-index="${activeIndex}"]`)
			?.focus();
	}

	function handleTriggerKeydown(event: KeyboardEvent): void {
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			if (!open) void openAtSelected();
			else moveActive(event.key === "ArrowDown" ? 1 : -1);
		} else if (event.key === "Escape" && open) {
			event.preventDefault();
			close();
		}
	}

	function handleOptionKeydown(event: KeyboardEvent): void {
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			moveActive(event.key === "ArrowDown" ? 1 : -1);
		} else if (event.key === "Escape") {
			event.preventDefault();
			close();
			trigger.focus();
		}
	}

	function dismiss(event: MouseEvent): void {
		if (root && event.target instanceof Node && !root.contains(event.target)) {
			close();
		}
	}
</script>

<svelte:window on:mousedown={dismiss} />

<div bind:this={root} class="ui-select" use:tooltipAction={tooltip ?? ""}>
	<label
		id={`${controlId}-label`}
		class:visually-hidden={!showLabel}
		for={controlId}>{label}</label
	>
	<button
		bind:this={trigger}
		id={controlId}
		class="ui-select__control"
		class:ui-select__control--open={open}
		type="button"
		aria-labelledby={`${controlId}-label ${controlId}-value`}
		aria-expanded={open}
		aria-haspopup="listbox"
		aria-controls={`${controlId}-options`}
		data-uisfx={open ? "close" : "open"}
		{disabled}
		on:click={toggle}
		on:keydown={handleTriggerKeydown}
	>
		<span
			id={`${controlId}-value`}
			class:ui-select__placeholder={!selectedOption}
		>
			{selectedOption?.label ?? placeholder ?? "Select an option"}
		</span>
		<Icon
			name={open ? "fa-chevron-up" : "fa-chevron-down"}
			size="sm"
			type="solid"
		/>
	</button>

	{#if open}
		<div id={`${controlId}-options`} class="ui-select__popover" class:ui-select__popover--inline={inlineMenu} role="listbox">
			{#each options as option, index (option.value)}
				<button
					class="ui-select__option"
					class:ui-select__option--selected={option.value === value}
					type="button"
					role="option"
					aria-selected={option.value === value}
					data-uisfx="select"
					data-option-index={index}
					disabled={option.disabled}
					on:focus={() => (activeIndex = index)}
					on:keydown={handleOptionKeydown}
					on:click={() => selectOption(option)}
				>
					<span>{option.label}</span>
					{#if option.description}<small>{option.description}</small>{/if}
					{#if option.value === value}
						<Icon name="fa-check" size="sm" type="solid" />
					{/if}
				</button>
			{/each}
		</div>
	{/if}
	{#if hint}<small>{hint}</small>{/if}
</div>

<style lang="scss">
	.ui-select {
		position: relative;
		min-width: 0;
		display: grid;
		gap: var(--gutter-sm);
		color: var(--color-light-secondary);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
	}

	.ui-select__control {
		width: 100%;
		min-width: 0;
		height: var(--control-height-md);
		box-sizing: border-box;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--gutter-md);
		border: 1px solid var(--color-dark-secondary);
		border-radius: var(--radius);
		padding: 0 var(--gutter-md);
		color: var(--color-light-primary);
		background: transparent;
		font: inherit;
		font-size: var(--font-size-md);
		font-weight: var(--font-weight);
		text-align: left;
		cursor: pointer;
	}

	.ui-select__control--open,
	.ui-select__control:focus-visible {
		border-color: var(--color-accent-primary);
		outline: none;
	}

	.ui-select__control:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.ui-select__placeholder {
		color: var(--color-light-tertiary);
	}

	.ui-select__popover {
		position: absolute;
		top: calc(100% + var(--gutter-sm));
		left: 0;
		right: 0;
		z-index: calc(var(--z-popover) + 1);
		max-height: var(--select-menu-max-height);
		display: grid;
		gap: var(--gutter-sm);
		border: 1px solid var(--color-dark-secondary);
		border-radius: var(--radius);
		padding: var(--gutter-sm);
		background: var(--color-dark-primary);
		box-shadow: var(--shadow);
		overflow-y: auto;
	}

	.ui-select__popover--inline {
		position: static;
	}

	.ui-select__option {
		min-height: var(--control-height-sm);
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 2px var(--gutter-md);
		border: 0;
		border-radius: var(--radius);
		padding: var(--gutter-sm) var(--gutter-md);
		color: var(--color-light-secondary);
		background: transparent;
		font: inherit;
		font-size: var(--font-size-md);
		font-weight: var(--font-weight);
		text-align: left;
		cursor: pointer;
	}

	.ui-select__option:hover:not(:disabled),
	.ui-select__option:focus-visible,
	.ui-select__option--selected {
		color: var(--color-light-primary);
		background: rgbaa(var(--color-dark-secondary), 0.35);
		outline: none;
	}

	.ui-select__option:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}

	.ui-select__option small {
		grid-column: 1;
		color: var(--color-light-tertiary);
		font-size: var(--font-size-xs);
	}

	small {
		color: var(--color-light-tertiary);
		font-weight: var(--font-weight);
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
</style>
