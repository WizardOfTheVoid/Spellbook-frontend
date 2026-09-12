<script lang="ts">
	import Icon from "./Icon.svelte";
	import { createControlId } from "$lib/utils/controlIds";

	export let items: { value: string; label: string; icon?: string }[];
	export let value: string;
	export let label: string;
	export let disabled = false;
	export let onChange: (value: string) => void;

	const id = createControlId(`tabs`);
	let buttons: HTMLButtonElement[] = [];

	function handleKeydown(event: KeyboardEvent, index: number) {
		let next = index;
		if (event.key === `ArrowRight`) next = (index + 1) % items.length;
		else if (event.key === `ArrowLeft`)
			next = (index - 1 + items.length) % items.length;
		else if (event.key === `Home`) next = 0;
		else if (event.key === `End`) next = items.length - 1;
		else return;
		event.preventDefault();
		buttons[next]?.focus();
		if (items[next].value !== value) onChange(items[next].value);
	}
</script>

<div class="tabs">
	<div class="tabs__list" role="tablist" aria-label={label}>
		{#each items as item, index (item.value)}
			<button
				bind:this={buttons[index]}
				id={`${id}-${item.value}`}
				type="button"
				role="tab"
				aria-selected={value === item.value}
				aria-controls={`${id}-panel`}
				tabindex={value === item.value ? 0 : -1}
				{disabled}
				data-uisfx="select"
				on:click={() => {
					if (item.value !== value) onChange(item.value);
				}}
				on:keydown={(event) => handleKeydown(event, index)}
			>
				{#if item.icon}<Icon name={item.icon} size="sm" />{/if}
				<span>{item.label}</span>
			</button>
		{/each}
	</div>
	<div
		class="tabs__panel"
		id={`${id}-panel`}
		role="tabpanel"
		aria-labelledby={`${id}-${value}`}
		tabindex="0"
	>
		<slot />
	</div>
</div>

<style lang="scss">
	.tabs,
	.tabs__panel {
		min-width: 0;
		display: grid;
		align-content: start;
		gap: var(--gutter-lg);
	}

	.tabs__list {
		display: flex;
		min-width: 0;
		border: 1px solid var(--color-dark-tertiary);
		border-radius: var(--radius-xl);
		background: rgbaa(var(--color-dark-primary), 0.4);
	}

	button {
		flex: 1 1 0;
		min-width: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--gutter-sm);
		margin: -1px;
		padding: var(--gutter) var(--gutter-md);
		border: 1px solid transparent;
		border-radius: var(--radius-xl);
		background: transparent;
		color: var(--color-light-secondary);
		font-weight: var(--font-weight-medium);
		cursor: pointer;
	}

	button:hover:not(:disabled):not([aria-selected="true"]) {
		color: var(--color-light-primary);
		border-color: transparent;
	}

	button[aria-selected="true"] {
		color: var(--color-light-primary);
		border-color: var(--color-accent-primary);
		background: rgbaa(var(--color-accent-primary), 0.12);
		box-shadow: inset 0 0 16px rgbaa(var(--color-accent-primary), 0.08);
	}

	button[aria-selected="true"] :global(.icon) {
		color: var(--color-accent-primary);
	}

	button:focus-visible,
	.tabs__panel:focus-visible {
		border: 2px solid var(--color-accent-primary);
		outline-offset: 2px;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
</style>
