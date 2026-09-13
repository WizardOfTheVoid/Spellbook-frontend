<script lang="ts">
	import type { HTMLInputAttributes } from "svelte/elements";
	import { createControlId } from "$lib/utils/controlIds";
	import Icon from "./Icon.svelte";
	import IconButton from "./IconButton.svelte";

	export let value: string | number = "";
	export let label: string;
	type InputType =
		| "text"
		| "email"
		| "password"
		| "number"
		| "search"
		| "tel"
		| "url";

	export let type: InputType = "text";
	export let id: string | null = null;
	export let placeholder = "";
	export let icon: string | null = null;
	export let button: string | null = null;
	export let buttonAriaLabel: string | null = null;
	export let buttonAction: (() => void) | null = null;
	export let hint: string | null = null;
	export let error: string | null = null;
	export let disabled = false;
	export let required = false;
	export let min: number | null = null;
	export let max: number | null = null;
	export let step: number | null = null;
	export let maxlength: number | null = null;
	export let autocomplete: HTMLInputAttributes["autocomplete"] = undefined;
	export let onChange: ((value: string) => void) | null = null;

	const generatedId = createControlId("input");

	$: controlId = id ?? generatedId;
	$: messageId = hint || error ? `${controlId}-message` : undefined;
	$: resolvedIcon = icon ?? inputTypeIcon(type);
	$: hasButton = Boolean(button && buttonAction);

	function inputTypeIcon(inputType: InputType): string | null {
		return {
			text: null,
			email: "fa-envelope",
			password: "fa-lock",
			number: "fa-hashtag",
			search: "fa-magnifying-glass",
			tel: "fa-phone",
			url: "fa-link",
		}[inputType];
	}
</script>

<div class="ui-input">
	<label class="ui-input__label" for={controlId}>{label}</label>
	<span class="ui-input__control" class:ui-input__control--invalid={error}>
		{#if resolvedIcon}
			<span class="ui-input__icon" aria-hidden="true">
				<Icon name={resolvedIcon} size="lg" tone="success" />
			</span>
		{/if}
		<input
			id={controlId}
			class:ui-input__field--with-icon={resolvedIcon}
			class:ui-input__field--with-button={hasButton}
			{type}
			{value}
			{placeholder}
			{disabled}
			{required}
			min={min ?? undefined}
			max={max ?? undefined}
			step={step ?? undefined}
			maxlength={maxlength ?? undefined}
			{autocomplete}
			aria-invalid={error ? "true" : undefined}
			aria-describedby={messageId}
			on:input={(event) => onChange?.(event.currentTarget.value)}
		/>
		{#if button && buttonAction}
			<span class="ui-input__action">
				<IconButton
					icon={button}
					ariaLabel={buttonAriaLabel ?? `${label} action`}
					size="sm"
					shape="rounded"
					{disabled}
					onClick={buttonAction}
				/>
			</span>
		{/if}
		<slot name="trailing" />
	</span>
	{#if error || hint}
		<small
			id={messageId}
			class="ui-input__message"
			class:ui-input__message--error={error}
		>
			{error ?? hint}
		</small>
	{/if}
</div>

<style lang="scss">
	.ui-input {
		min-width: 0;
		display: grid;
		gap: var(--gutter-sm);
		color: var(--color-light-secondary);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
	}

	.ui-input__control {
		position: relative;
		width: 100%;
		min-width: 0;
		height: var(--control-height-md);
		box-sizing: border-box;
		display: flex;
		align-items: center;
		border: 1px solid var(--color-dark-secondary);
		border-radius: var(--radius);
		background: transparent;
		transition: border-color var(--motion-fast) var(--motion-ease);
	}

	.ui-input__control:focus-within {
		border-color: var(--color-accent-primary);
	}

	.ui-input__control--invalid {
		border-color: var(--color-accent-quaternary);
	}

	input {
		width: 100%;
		min-width: 0;
		height: 100%;
		border: 0;
		padding: 0 var(--gutter-md);
		color: var(--color-light-primary);
		background: transparent;
		outline: none;
	}

	.ui-input__field--with-icon {
		padding-left: calc(var(--gutter-md) * 3.4);
	}

	.ui-input__field--with-button {
		padding-right: calc(var(--control-height-sm) + var(--gutter-md));
	}

	.ui-input__icon {
		position: absolute;
		left: calc(var(--gutter-md) * 1);
		display: inline-flex;
		pointer-events: none;
	}

	.ui-input__action {
		position: absolute;
		top: 50%;
		right: var(--gutter-md);
		display: inline-flex;
		transform: translateY(-50%);
	}

	input::placeholder {
		color: var(--color-light-tertiary);
	}

	input:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.ui-input__message {
		color: var(--color-light-tertiary);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight);
	}

	.ui-input__message--error {
		color: var(--color-accent-quaternary);
	}
</style>
