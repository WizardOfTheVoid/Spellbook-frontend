<script lang="ts">
	import type { MenuItem } from "$lib/types/ui";
	import Icon from "./Icon.svelte";
	import IconButton from "./IconButton.svelte";

	export let items: MenuItem[];
	export let ariaLabel = "Row actions";
	export let align: "left" | "right" = "right";

	let open = false;

	function select(item: MenuItem): void {
		if (item.disabled) return;
		open = false;
		item.onSelect();
	}

	// Swallows the dismissing click so it cannot reach the overlay backdrop and hide the whole overlay.
	function dismiss(event: MouseEvent): void {
		event.stopPropagation();
		event.preventDefault();
		open = false;
	}
</script>

<svelte:window
	on:keydown={(event) => {
		if (event.key === "Escape") open = false;
	}}
/>

<div class="row-menu">
	<IconButton
		icon="fa-ellipsis-vertical"
		{ariaLabel}
		size="sm"
		expanded={open}
		sfx={open ? "close" : "open"}
		stopPropagation
		onClick={() => (open = !open)}
	/>

	{#if open}
		<button
			class="row-menu__scrim"
			type="button"
			tabindex="-1"
			aria-hidden="true"
			data-uisfx="close"
			on:click={dismiss}
		></button>
		<div class={`row-menu__popover row-menu__popover--${align}`} role="menu">
			{#each items as item (item.label)}
				<button
					class={`row-menu__item row-menu__item--${item.tone ?? "default"}`}
					type="button"
					role="menuitem"
					data-uisfx="select"
					disabled={item.disabled}
					on:click={(event) => {
						event.stopPropagation();
						select(item);
					}}
				>
					{#if item.icon}
						<Icon name={item.icon} size="md" tone={item.tone ?? "default"} />
					{/if}
					<span>{item.label}</span>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style lang="scss">
	.row-menu {
		position: relative;
		display: inline-flex;
	}

	.row-menu__scrim {
		position: fixed;
		inset: 0;
		z-index: var(--z-popover);
		border: 0;
		border-radius: 0;
		background: transparent;
		cursor: default;
	}

	.row-menu__popover {
		position: absolute;
		top: calc(100% + var(--gutter-sm));
		z-index: calc(var(--z-popover) + 1);
		min-width: 180px;
		display: grid;
		gap: var(--gutter-sm);
		border: 1px solid var(--color-dark-secondary);
		border-radius: var(--radius);
		padding: var(--gutter-sm);
		background: var(--color-dark-primary);
		box-shadow: var(--shadow);
	}

	.row-menu__popover--right {
		right: 0;
	}

	.row-menu__popover--left {
		left: 0;
	}

	.row-menu__item {
		display: flex;
		align-items: center;
		gap: var(--gutter-sm);
		min-height: var(--control-height-sm);
		border: 0;
		border-radius: var(--radius);
		padding: 0 var(--gutter-md);
		background: none;
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		text-align: left;
	}

	.row-menu__item:hover:not(:disabled) {
		background: var(--color-dark-primary);
	}

	.row-menu__item--danger {
		color: var(--color-accent-tertiary);
	}
</style>
