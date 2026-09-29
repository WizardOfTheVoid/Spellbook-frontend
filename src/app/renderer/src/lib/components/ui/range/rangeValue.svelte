<script lang="ts">
	export let value: number;
	export let label: string;
	export let disabled = false;
	export let formatValue: (value: number) => string;
	export let onChange: (value: number) => void;
	export let position = 0;
	export let visible = true;
	export let above = false;
	export let row = 0;
	let width = 0;

	let editing = false;
	let draft = ``;

	export function startEditing() {
		if (disabled) return;
		draft = `${value}`;
		editing = true;
	}

	function focus(input: HTMLInputElement) {
		input.focus();
		input.select();
	}

	function commit() {
		if (!editing) return;
		editing = false;
		const next = Number(draft);
		if (!disabled && draft.trim() && Number.isFinite(next)) onChange(next);
	}

	function handleKey(event: KeyboardEvent) {
		if (event.key !== `Enter` && event.key !== `Escape`) return;
		event.preventDefault();
		event.stopPropagation();
		if (event.key === `Enter`) commit();
		else editing = false;
	}
</script>

<span
	class="range-value"
	class:hidden={!visible && !editing}
	class:editing
	bind:clientWidth={width}
	style={`left: clamp(${width / 2}px, ${position}%, calc(100% - ${width / 2}px)); top: calc(50% + ${above ? -24 : 10 + row * 22}px)`}
>
	{#if editing}
		<input
			use:focus
			type="number"
			step="any"
			aria-label={label}
			value={draft}
			{disabled}
			on:input={(event) => (draft = event.currentTarget.value)}
			on:blur={commit}
			on:keydown={handleKey}
		/>
	{:else}
		<span>{formatValue(value)}</span>
	{/if}
</span>

<style>
	.range-value {
		display: inline-flex;
		white-space: nowrap;
		position: absolute;
		z-index: 4;
		transform: translateX(-50%);
		pointer-events: none;
		color: var(--color-light-primary);
		font-variant-numeric: tabular-nums;
		transition:
			left var(--range-duration) var(--easing),
			top var(--range-duration) var(--easing),
			opacity var(--range-duration) var(--easing);
	}
	.hidden {
		opacity: 0;
		visibility: hidden;
	}
	.editing {
		pointer-events: auto;
	}
	input {
		width: 4em;
		min-width: 0;
		border: 0;
		outline: none;
		box-shadow: none;
		border-radius: 9999px;
		padding: 4px 4px;
		background: var(--color-dark-secondary);
		border: 1px solid var(--color-dark-tertiary);
		color: inherit;
		font: inherit;
		text-align: center;
	}
</style>
