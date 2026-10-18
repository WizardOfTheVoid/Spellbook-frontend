<script lang="ts">
	import { tick } from "svelte";
	import { notifyError } from "$lib/notifications/notificationEvents";
	import { tooltip as tooltipAction } from "$lib/utils/tooltip";
	import Icon from "./Icon.svelte";
	import IconButton from "./IconButton.svelte";
	import InfinityMenuItemContent from "./infinityMenuItemContent.svelte"
	import {
		closeInfinityMenu,
		closeInfinityMenuOnContextMenu,
		infinityMenuState,
		loadInfinityMenuChildren,
		positionInfinityMenu,
		resolveInfinityMenuLevel,
		selectInfinityMenuToggles,
		toggleInfinityMenuItem,
		type InfinityMenuItem,
	} from "./infinityMenu";

	let menuNode: HTMLDivElement;
	let activeId = 0;
	let path: number[] = [];
	let left = 0;
	let top = 0;
	let positioned = false;
	let positionRequestId = 0;
	let loadedChildren = new Map<string, InfinityMenuItem[]>();
	let checkedOverrides = new Map<string, boolean>();
	let pendingToggles = new Set<string>();

	$: snapshot = $infinityMenuState;
	$: if (snapshot && snapshot.id !== activeId) {
		activeId = snapshot.id;
		path = [];
		loadedChildren = new Map();
		checkedOverrides = new Map();
		pendingToggles = new Set();
		positioned = false;
		void positionMenu(true);
	}
	$: level =
		snapshot ?
			resolveInfinityMenuLevel(snapshot.menu, path, loadedChildren)
		:	null;

	function enter(item: InfinityMenuItem, index: number): void {
		if (item.disabled || (!item.children?.length && !item.loadChildren)) return;
		const nextPath = [...path, index];
		path = nextPath;
		void positionMenu(true);
		if (item.loadChildren && !loadedChildren.has(nextPath.join(`.`))) {
			void loadChildren(item, nextPath);
		}
	}

	async function loadChildren(
		item: InfinityMenuItem,
		nextPath: number[],
	): Promise<void> {
		const snapshot = $infinityMenuState;
		if (!snapshot || !item.loadChildren) return;
		const key = nextPath.join(`.`);
		loadedChildren = new Map(loadedChildren).set(key, [
			{ name: `Loading`, icon: `fa-spinner`, disabled: true },
		]);
		void positionMenu(true);
		const children = await loadInfinityMenuChildren(
			item,
			() => loadChildren(item, nextPath),
			(error) =>
				notifyError(
					error instanceof Error ? error.message : `Offenses request failed.`,
				),
		);
		if ($infinityMenuState?.id !== snapshot.id) return;
		loadedChildren = new Map(loadedChildren).set(key, children);
		void positionMenu(true);
	}

	function back(): void {
		path = path.slice(0, -1);
		void positionMenu(true);
	}

	async function runAction(item: InfinityMenuItem): Promise<void> {
		if (item.disabled || typeof item.action !== `function`) return;
		if (item.closeOnAction !== false) closeInfinityMenu();
		await item.action();
	}

	function toggleKey(index: number): string {
		return [...path, index].join(`.`)
	}

	function isChecked(item: InfinityMenuItem, index: number, overrides: Map<string, boolean>): boolean {
		return overrides.get(toggleKey(index)) ?? item.toggle?.checked ?? false
	}

	async function runToggle(item: InfinityMenuItem, index: number): Promise<void> {
		if (!item.toggle || item.disabled) return
		const key = toggleKey(index)
		if (pendingToggles.has(key)) return
		const menuId = $infinityMenuState?.id
		pendingToggles = new Set(pendingToggles).add(key)
		try {
			const checked = await toggleInfinityMenuItem(item, isChecked(item, index, checkedOverrides))
			if ($infinityMenuState?.id === menuId) {
				const next = new Map(checkedOverrides)
				for (const [peerIndex, selected] of selectInfinityMenuToggles(level?.items ?? [], index, checked)) {
					next.set(toggleKey(peerIndex), selected)
				}
				checkedOverrides = next
			}
		} catch (error) {
			notifyError(error instanceof Error ? error.message : `Unable to update option.`)
		} finally {
			if ($infinityMenuState?.id === menuId) {
				pendingToggles = new Set(pendingToggles)
				pendingToggles.delete(key)
			}
		}
	}

	async function positionMenu(shouldFocus = false): Promise<void> {
		const current = $infinityMenuState;
		if (!current) return;

		const requestId = ++positionRequestId;
		await tick();

		if (
			requestId !== positionRequestId ||
			!menuNode ||
			$infinityMenuState?.id !== current.id
		) {
			return;
		}

		const rect = menuNode.getBoundingClientRect();
		const position = positionInfinityMenu(
			current,
			{ width: rect.width, height: rect.height },
			{ width: window.innerWidth, height: window.innerHeight },
			positioned ? { x: left, y: top } : undefined,
		)

		left = position.x;
		top = position.y;
		positioned = true;
		if (shouldFocus) {
			await tick()
			if ($infinityMenuState?.id === current.id) menuNode.focus()
		}
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (!$infinityMenuState) return;

		if (event.key === `Escape`) closeInfinityMenu();
		if (event.key === `ArrowLeft` && path.length > 0) back();
	}

	function portal(node: HTMLElement, container: HTMLElement | null) {
		const parent = node.parentNode
		const next = node.nextSibling
		const move = (target: HTMLElement | null) => {
			if (target) target.append(node)
			else if (node.parentNode !== parent) parent?.insertBefore(node, next?.parentNode === parent ? next : null)
		}
		move(container)
		return { update: move, destroy: () => node.remove() }
	}

	function dismiss(event: MouseEvent): void {
		if (snapshot?.container) event.stopPropagation()
		closeInfinityMenu()
	}
</script>

<svelte:window
	on:keydown={handleKeydown}
	on:resize={() => void positionMenu()}
/>

{#if snapshot && level}
	<button
		class="infinity-menu__scrim"
		type="button"
		tabindex="-1"
		aria-hidden="true"
		data-uisfx="close"
		use:portal={snapshot.container}
		on:click={dismiss}
		on:contextmenu={closeInfinityMenuOnContextMenu}
	></button>

	<div
		bind:this={menuNode}
		use:portal={snapshot.container}
		class="infinity-menu"
		class:infinity-menu--positioned={positioned}
		style={`left: ${left}px; top: ${top}px;`}
		role="menu"
		aria-label={level.name}
		tabindex="-1"
	>
		<header class="infinity-menu__header">
			{#if path.length > 0}
				<IconButton icon="fa-chevron-left" ariaLabel="Back" size="sm" sfx="back" onClick={back} />
			{/if}
			<span class="infinity-menu__title">
				<Icon name={level.icon} size="md" />
				<span class="infinity-menu__title-copy">
					<strong>{level.name}</strong>
					{#if level.subtitle}<small>{level.subtitle}</small>{/if}
				</span>
			</span>
			<IconButton icon="fa-xmark" ariaLabel="Close menu" size="sm" sfx="close" onClick={closeInfinityMenu} />
		</header>

		<div class="infinity-menu__items">
			{#each level.items as item, index}
				{#if item.separator}
					<div class="infinity-menu__separator" role="separator"></div>
				{:else if item.children?.length || item.loadChildren}
					<button
						class="infinity-menu__item"
						type="button"
						role="menuitem"
						data-uisfx="select"
						use:tooltipAction={item.tooltip ?? ""}
						disabled={item.disabled}
						on:click={() => enter(item, index)}
					>
						<InfinityMenuItemContent {item} trailing="child" />
					</button>
				{:else if item.toggle}
					<button
						class="infinity-menu__item"
						class:infinity-menu__item--selected={isChecked(item, index, checkedOverrides)}
						type="button"
						role={item.toggle.group ? `menuitemradio` : `menuitemcheckbox`}
						aria-checked={isChecked(item, index, checkedOverrides)}
						data-uisfx="select"
						use:tooltipAction={item.tooltip ?? ""}
						disabled={item.disabled || pendingToggles.has(toggleKey(index))}
						on:click={() => void runToggle(item, index)}
					>
						<InfinityMenuItemContent {item} trailing="toggle" checked={isChecked(item, index, checkedOverrides)} />
					</button>
				{:else if typeof item.action === "string" && !item.disabled}
					<a
						class="infinity-menu__item"
						href={item.action}
						target="_blank"
						rel="noreferrer"
						role="menuitem"
						data-uisfx="select"
						use:tooltipAction={item.tooltip ?? ""}
						on:click={closeInfinityMenu}
					>
						<InfinityMenuItemContent {item} />
					</a>
				{:else}
					<button
						class="infinity-menu__item"
						type="button"
						role="menuitem"
						data-uisfx="select"
						use:tooltipAction={item.tooltip ?? ""}
						disabled={item.disabled || typeof item.action !== "function"}
						on:click={() => void runAction(item)}
					>
						<InfinityMenuItemContent {item} />
					</button>
				{/if}
			{/each}
		</div>
	</div>
{/if}

<style lang="scss">
	.infinity-menu__scrim {
		position: fixed;
		inset: 0;
		z-index: var(--z-popover);
		border: 0;
		border-radius: 0;
		background: transparent;
		cursor: default;
	}

	.infinity-menu {
		position: fixed;
		z-index: calc(var(--z-popover) + 1);
		width: min(276px, calc(100vw - 24px));
		max-height: calc(100vh - 24px);
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		border: 1px solid var(--color-dark-tertiary);
		border-radius: var(--radius);
		background: var(--color-dark-primary);
		box-shadow: var(--shadow);
		overflow: hidden;
		opacity: 0;
		visibility: hidden;
	}

	.infinity-menu--positioned {
		opacity: 1;
		visibility: visible;
	}

	.infinity-menu:focus-visible {
		outline: 2px solid var(--color-accent-secondary);
		outline-offset: 2px;
	}

	.infinity-menu__header {
		display: flex;
		align-items: center;
		gap: var(--gutter-sm);
		border-bottom: 1px solid var(--color-dark-secondary);
		padding: var(--gutter-md);
	}

	.infinity-menu__title {
		min-width: 0;
		flex: 1;
		display: flex;
		align-items: center;
		gap: var(--gutter-sm);
		font-size: var(--font-size-xs);
	}

	.infinity-menu__title-copy {
		min-width: 0;
		display: grid;
		gap: 2px;
	}

	.infinity-menu__title-copy strong,
	.infinity-menu__title-copy small {
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.infinity-menu__title-copy strong { white-space: nowrap; }
	.infinity-menu__title-copy small { color: var(--color-light-tertiary); font-weight: var(--font-weight); }

	.infinity-menu__items {
		display: grid;
		gap: 2px;
		padding: var(--gutter-sm);
		overflow-y: auto;
	}

	.infinity-menu__separator { height: 1px; margin: var(--gutter-md) var(--gutter-sm); background: var(--color-dark-secondary); }

	.infinity-menu__item {
		min-height: var(--control-height-sm);
		display: block;
		align-items: center;
		border: 1px solid transparent;
		border-radius: var(--radius);
		padding: calc(var(--gutter-sm) + 4px) var(--gutter-md);
		background: transparent;
		color: inherit;
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		text-align: left;
		text-decoration: none;
	}

	.infinity-menu__item:hover:not(:disabled),
	.infinity-menu__item:focus-visible {
		background: var(--color-dark-secondary);
	}

	.infinity-menu__item--selected,
	.infinity-menu__item--selected:hover:not(:disabled),
	.infinity-menu__item--selected:focus-visible {
		border-color: var(--color-accent-primary);
		background: rgbaa(var(--color-accent-primary), 0.05);
	}

	.infinity-menu__item:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

</style>
