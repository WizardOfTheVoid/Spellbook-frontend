<script lang="ts">
	import { tooltip } from "$lib/utils/tooltip"
	import { nextTabbedListIndex } from "./tabbedList"

	type TabbedListTab = Readonly<{ id: string; label: string; icon: string; tooltip: string }>
	export let title: string
	export let caption: string
	export let tabs: readonly TabbedListTab[]
	export let selected: string
	export let onSelect: (id: string) => void

	$: cardId = `tabbed-list-${title.toLowerCase().replaceAll(/[^a-z0-9]+/g, `-`)}`

	function select(id: string): void {
		if (id !== selected) onSelect(id)
	}

	function handleKeydown(event: KeyboardEvent, index: number): void {
		const next = nextTabbedListIndex(event.key, index, tabs.length)
		if (next === null) return
		event.preventDefault()
		const tab = tabs[next]
		if (!tab) return
		select(tab.id)
		const buttons = (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLButtonElement>(`[role="tab"]`)
		buttons?.[next]?.focus()
	}
</script>

<article class="tabbed-list-card">
	<header>
		<div><span>{title}</span><small>{caption}</small></div>
		<div class="tabbed-list-card__tabs" role="tablist" aria-label={`${title} views`}>
			{#each tabs as tab, index (tab.id)}
				<button
					id={`${cardId}-${tab.id}-tab`}
					type="button"
					role="tab"
					aria-selected={selected === tab.id}
					aria-controls={`${cardId}-${tab.id}-panel`}
					tabindex={selected === tab.id ? 0 : -1}
					class:tabbed-list-card__tab--selected={selected === tab.id}
					data-uisfx="select"
					use:tooltip={tab.tooltip}
					on:click={() => select(tab.id)}
					on:keydown={(event) => handleKeydown(event, index)}
				>
					<i class={`fa-solid ${tab.icon}`} aria-hidden="true"></i><span>{tab.label}</span>
				</button>
			{/each}
		</div>
	</header>
	<div
		class="tabbed-list-card__panel"
		id={`${cardId}-${selected}-panel`}
		role="tabpanel"
		aria-labelledby={`${cardId}-${selected}-tab`}
	>
		<slot />
	</div>
</article>

<style lang="scss">
	.tabbed-list-card { min-width: 0; border: 1px solid var(--color-dark-secondary); border-radius: var(--radius); padding: var(--gutter-lg); background: rgbaa(var(--color-dark-primary), 0.34); }
	header { display: grid; gap: var(--gutter-md); }
	header > div:first-child { display: grid; gap: 2px; color: var(--color-light-secondary); font-size: var(--font-size-sm); }
	header small { color: var(--color-light-tertiary); font-size: var(--font-size-xs); }
	.tabbed-list-card__tabs { display: flex; flex-wrap: wrap; gap: var(--gutter-sm); }
	.tabbed-list-card__tabs button { display: inline-flex; align-items: center; gap: var(--gutter-sm); min-height: var(--control-height-sm); border: 1px solid var(--color-dark-tertiary); border-radius: var(--radius); padding: 0 var(--gutter-md); color: var(--color-text-secondary); font-size: var(--font-size-xs); cursor: pointer; transition: all var(--motion-fast) var(--motion-ease); }
	.tabbed-list-card__tabs button:hover,
	.tabbed-list-card__tabs button:focus-visible,
	.tabbed-list-card__tabs .tabbed-list-card__tab--selected { border-color: var(--color-accent-primary); color: var(--color-light-primary); }
	.tabbed-list-card__tabs .tabbed-list-card__tab--selected { background: rgbaa(var(--color-accent-primary), 0.1); box-shadow: 0 0 40px rgbaa(var(--color-accent-primary), 0.08); }
	.tabbed-list-card__tabs .tabbed-list-card__tab--selected i { color: var(--color-accent-primary); }
	.tabbed-list-card__panel { min-height: 240px; margin-top: var(--gutter-md); }
</style>
