<script lang="ts">
	import { tooltip as tooltipAction } from "$lib/utils/tooltip";
	import Icon from "./Icon.svelte";

	export let value = "";
	export let placeholder = "Search";
	export let label: string | null = null;
	export let tooltip: string | null = null;
	export let onInput: ((event: Event) => void) | null = null;
</script>

<label class="search-field" use:tooltipAction={tooltip ?? ""}>
	{#if label}<span class="search-field__label">{label}</span>{/if}
	<span class="search-field__control">
		<span class="search-field__icon">
			<Icon name="fa-magnifying-glass" size="lg" tone="success" />
		</span>
		<input type="search" {placeholder} bind:value on:input={onInput} />
		<slot name="trailing" />
	</span>
</label>

<style lang="scss">
	.search-field {
		position: relative;
		width: 100%;
		max-width: 100%;
		display: flex;
		flex-direction: column;
		flex: 1 1 auto;

		gap: var(--gutter-sm);
		color: var(--color-text-secondary);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);

		&,
		& * {
			box-sizing: border-box;
		}
	}

	.search-field__control {
		display: flex;
		align-items: center;
		width: 100%;
		max-width: 100%;
		flex: 1 1 auto;
	}

	.search-field__icon {
		position: absolute;
		left: calc(var(--gutter-md) * 1.5);
		display: inline-flex;
		pointer-events: none;
		color: var(--color-accent-secondary);
	}

	input {
		width: 100%;
		max-width: 100%;
		flex: 1 1 auto;
		height: var(--control-height-lg);
		border: 1px solid var(--color-dark-secondary);
		border-radius: var(--radius);
		padding: 0 calc(var(--gutter-md) * 4.5) 0 calc(var(--gutter-md) * 4);
		color: var(--color-light-primary);
		line-height: 30;
		outline: none;

		&::-webkit-search-decoration,
		&::-webkit-search-cancel-button,
		&::-webkit-search-results-button,
		&::-webkit-search-results-decoration {
			display: none;
		}
	}

	input:focus {
		border-color: var(--color-dark-secondary);
	}

	input::placeholder {
		color: var(--color-light-tertiary);
	}
</style>
