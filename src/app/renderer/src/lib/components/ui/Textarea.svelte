<script lang="ts">
	import { createControlId } from "$lib/utils/controlIds"

	export let value = ""
	export let label: string
	export let id: string | null = null
	export let placeholder = ""
	export let hint: string | null = null
	export let disabled = false
	export let required = false
	export let maxlength: number | null = null
	export let rows = 4
	export let element: HTMLTextAreaElement
	export let onChange: ((value: string) => void) | null = null

	const generatedId = createControlId("textarea")
	$: controlId = id ?? generatedId
	$: messageId = hint ? `${controlId}-message` : undefined
</script>

<div class="ui-textarea">
	<label for={controlId}>{label}</label>
	<textarea
		bind:this={element}
		id={controlId}
		{value}
		{placeholder}
		{disabled}
		{required}
		{rows}
		maxlength={maxlength ?? undefined}
		aria-describedby={messageId}
		on:input={(event) => onChange?.(event.currentTarget.value)}
	></textarea>
	{#if hint}<small id={messageId}>{hint}</small>{/if}
</div>

<style lang="scss">
	.ui-textarea {
		min-width: 0;
		display: grid;
		gap: var(--gutter-sm);
		color: var(--color-light-secondary);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
	}

	textarea {
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
		resize: vertical;
		border: 1px solid var(--color-dark-secondary);
		border-radius: var(--radius);
		padding: var(--gutter-md);
		color: var(--color-light-primary);
		background: transparent;
		font: inherit;
		font-size: var(--font-size-md);
		font-weight: var(--font-weight);
		line-height: 1.45;
		outline: none;
	}

	textarea:focus-visible {
		border-color: var(--color-accent-primary);
	}

	textarea:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	small {
		color: var(--color-light-tertiary);
		font-weight: var(--font-weight);
	}
</style>
