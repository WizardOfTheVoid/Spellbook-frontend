<script lang="ts">
	import { tick } from "svelte";
	import { notifyError } from "$lib/notifications/notificationEvents";
	import { tooltip as tooltipAction } from "$lib/utils/tooltip";
	import Icon from "./Icon.svelte";
	import IconButton from "./IconButton.svelte";
	import {
		closeInfinityMenu,
		closeInfinityMenuOnContextMenu,
		infinityMenuState,
		loadInfinityMenuChildren,
		positionInfinityMenu,
		resolveInfinityMenuLevel,
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

	$: snapshot = $infinityMenuState;
	$: if (snapshot && snapshot.id !== activeId) {
		activeId = snapshot.id;
		path = [];
		loadedChildren = new Map();
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
		);

		left = position.x;
		top = position.y;
		positioned = true;
		if (shouldFocus) menuNode.focus();
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (!$infinityMenuState) return;

		if (event.key === `Escape`) closeInfinityMenu();
		if (event.key === `ArrowLeft` && path.length > 0) back();
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
		on:click={closeInfinityMenu}
		on:contextmenu={closeInfinityMenuOnContextMenu}
	></button>

	<div
		bind:this={menuNode}
		class="infinity-menu"
		class:infinity-menu--positioned={positioned}
		style={`left: ${left}px; top: ${top}px;`}
		role="menu"
		aria-label={level.name}
		tabindex="-1"
	>
		<header class="infinity-menu__header">
			<IconButton
				icon={path.length > 0 ? "fa-chevron-left" : "fa-xmark"}
				ariaLabel={path.length > 0 ? "Back" : "Close menu"}
				size="sm"
				sfx={path.length > 0 ? "back" : "close"}
				onClick={path.length > 0 ? back : closeInfinityMenu}
			/>
			<span class="infinity-menu__title">
				<Icon name={level.icon} size="md" />
				<strong>{level.name}</strong>
			</span>
		</header>

		<div class="infinity-menu__items">
			{#each level.items as item, index}
				{#if item.children?.length || item.loadChildren}
					<button
						class="infinity-menu__item"
						type="button"
						role="menuitem"
						data-uisfx="select"
						use:tooltipAction={item.tooltip ?? ""}
						disabled={item.disabled}
						on:click={() => enter(item, index)}
					>
						<Icon name={item.icon} type={item.iconType ?? "light"} size="md" />
						<span>{item.name}{#if item.suffix} <small>{item.suffix}</small>{/if}{#if item.suffixIcon} <span class="personal-icon" aria-label="Personal profile"><Icon name={item.suffixIcon} size="sm" tone="muted" /></span>{/if}</span>
						<Icon name="fa-chevron-right" size="sm" tone="muted" />
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
						<Icon name={item.icon} type={item.iconType ?? "light"} size="md" />
						<span>{item.name}{#if item.suffix} <small>{item.suffix}</small>{/if}{#if item.suffixIcon} <span class="personal-icon" aria-label="Personal profile"><Icon name={item.suffixIcon} size="sm" tone="muted" /></span>{/if}</span>
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
						<Icon name={item.icon} type={item.iconType ?? "light"} size="md" />
						<span>{item.name}{#if item.suffix} <small>{item.suffix}</small>{/if}{#if item.suffixIcon} <span class="personal-icon" aria-label="Personal profile"><Icon name={item.suffixIcon} size="sm" tone="muted" /></span>{/if}</span>
					</button>
				{/if}
			{/each}
		</div>
	</div>
{/if}

<style lang="scss">
	.personal-icon { margin-left: 0.35em; opacity: 0.5; }
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
		width: min(240px, calc(100vw - 24px));
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
		padding: var(--gutter-sm);
	}

	.infinity-menu__title {
		min-width: 0;
		display: flex;
		align-items: center;
		gap: var(--gutter-sm);
		font-size: var(--font-size-xs);
	}

	.infinity-menu__title strong {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.infinity-menu__items {
		display: grid;
		gap: 2px;
		padding: var(--gutter-sm);
		overflow-y: auto;
	}

	.infinity-menu__item {
		min-height: var(--control-height-sm);
		display: grid;
		grid-template-columns: 22px minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--gutter-sm);
		border: 0;
		border-radius: var(--radius);
		padding: 0 var(--gutter-md);
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

	.infinity-menu__item:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.infinity-menu__item span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.infinity-menu__item small {
		color: var(--color-light-tertiary);
		font-size: inherit;
	}
</style>
