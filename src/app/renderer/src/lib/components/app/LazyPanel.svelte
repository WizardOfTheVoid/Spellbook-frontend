<script lang="ts">
	import type { LazyPanelComponent, LazyPanelName } from "./lazyPanelModules"
	import { loadLazyPanel } from "./lazyPanelModules"

	export let name: LazyPanelName
	let component: LazyPanelComponent | null = null
	let currentName: LazyPanelName | null = null
	let revision = 0

	$: if (name !== currentName) void select(name)

	async function select(nextName: LazyPanelName): Promise<void> {
		currentName = nextName
		component = null
		const selectedRevision = ++revision
		try {
			const loaded = await loadLazyPanel(nextName)
			if (selectedRevision === revision && currentName === nextName) component = loaded
		} catch {
			if (selectedRevision === revision) component = null
		}
	}
</script>

{#if component}
	<svelte:component this={component} {...$$restProps} />
{:else}
	<div class="lazy-panel__loader" role="status"><span></span><small>Loading view</small></div>
{/if}

<style lang="scss">
	.lazy-panel__loader { height: 100%; display: grid; place-content: center; justify-items: center; gap: var(--gutter-md); color: var(--color-light-tertiary); }
	.lazy-panel__loader span { width: 34px; height: 34px; border: 1px solid var(--color-dark-tertiary); border-top-color: var(--color-accent-primary); border-radius: 50%; animation: panel-spin 0.9s linear infinite; }
	@keyframes panel-spin { to { transform: rotate(360deg); } }
	@media (prefers-reduced-motion: reduce) { .lazy-panel__loader span { animation: none; } }
</style>
