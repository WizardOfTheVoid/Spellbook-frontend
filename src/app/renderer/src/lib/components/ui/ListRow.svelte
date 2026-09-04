<script lang="ts">
	import { infinityMenuState } from "./infinityMenu";

	export let title: string;
	export let subtitle: string | null = null;
	export let selected = false;
	export let outlineTone: "danger" | "warning" | null = null;
	export let onClick: (() => void) | null = null;
	export let onContextMenu: ((event: MouseEvent) => void) | null = null;
	let rowNode: HTMLDivElement;

	function handleClick(event: MouseEvent): void {
		const target = event.target;
		if (
			target instanceof Element &&
			target.closest("button, a, input, select, textarea")
		) {
			return;
		}
		onClick?.();
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (!onClick || event.target !== event.currentTarget) return;
		if (event.key !== "Enter" && event.key !== " ") return;
		event.preventDefault();
		onClick();
	}
</script>

<div
	bind:this={rowNode}
	class="list-row"
	class:list-row--selected={selected || $infinityMenuState?.owner === rowNode}
	class:list-row--clickable={Boolean(onClick)}
	class:list-row--outline-danger={outlineTone === "danger"}
	class:list-row--outline-warning={outlineTone === "warning"}
	role="button"
	aria-disabled={!onClick}
	data-uisfx={onClick ? "select" : undefined}
	tabindex={onClick ? 0 : -1}
	on:click={handleClick}
	on:contextmenu={onContextMenu}
	on:keydown={handleKeydown}
>
	<div class="list-row__leading">
		<slot name="leading" />
	</div>
	<div class="list-row__main">
		<span class="list-row__copy">
			{#if subtitle}<small class="list-row__id">{subtitle}</small>{/if}
			<span class="list-row__title">
				<strong {title}>{title}</strong>
				<slot name="titleTrailing" />
			</span>
		</span>
	</div>
	<div class="list-row__trailing">
		<slot name="trailing" />
	</div>
</div>

<style lang="scss">
	.list-row {
		min-height: 76px;
		display: flex;
		align-items: center;
		gap: var(--gutter-md);
		border: 1px solid var(--color-dark-secondary);
		border-radius: var(--radius);
		padding: var(--gutter-md) var(--gutter-md);
		background: transparent;

		&:hover {
			background-color: rgbaa(var(--color-dark-secondary), 0.05);
		}
	}

	.list-row--clickable {
		cursor: pointer;
	}

	.list-row--clickable:focus-visible {
		outline: 2px solid var(--color-accent-secondary);
		outline-offset: 2px;
	}

	.list-row--selected {
		background-color: rgbaa(var(--color-dark-secondary), 0.1);
	}

	.list-row--outline-danger {
		border-color: var(--color-accent-quaternary);
	}

	.list-row--outline-warning {
		border-color: var(--color-accent-tertiary);
	}

	.list-row__main {
		flex: 1 1 auto;
		align-self: stretch;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: var(--gutter-md);
		border: 0;
		padding: 0;
		background: none;
		text-align: left;
	}

	.list-row__leading:empty {
		display: none;
	}

	.list-row__leading {
		flex: 0 0 auto;
		display: inline-flex;
		align-items: center;
	}

	.list-row__copy {
		min-width: 0;
		display: grid;
		gap: var(--gutter-sm);
	}

	.list-row__title {
		min-width: 0;
		display: flex;
		align-items: center;
		gap: var(--gutter-sm);
	}

	.list-row__title strong {
		min-width: 0;
		overflow: hidden;
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-medium);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.list-row__id {
		color: var(--color-light-tertiary);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight);
		letter-spacing: 0.04em;
	}

	.list-row__trailing {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--gutter-md);
	}
</style>
