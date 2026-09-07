<script lang="ts">
	import { navigation, rememberNavigation, navigationScroll } from "$lib/navigation/navigation"
	import PanelHeader from '$lib/components/ui/PanelHeader.svelte'
	import Tag from '$lib/components/ui/Tag.svelte'
	import DashboardStatCard from '$lib/components/dashboard/dashboardStatCard.svelte'

	const tiles = [
		{ id: `ping`, title: `Ping patterns`, icon: `fa-signal`, description: `Explore player latency across servers.` },
		{ id: `playtime`, title: `Playtime patterns`, icon: `fa-clock`, description: `Explore player activity over time.` },
		{ id: `servers`, title: `Game server patterns`, icon: `fa-server`, description: `Explore the servers players visit.` },
		{ id: `vectors`, title: `Player vectors`, icon: `fa-fingerprint`, description: `Explore player similarities.` }
	]
	let selected: typeof tiles[number] | null = null
	rememberNavigation(`analysis`, () => selected, value => { selected = value }, value => value?.id)
</script>

<section class="panel-view analysis" aria-label="Analysis">
	<PanelHeader title="Analysis" eyebrow="Superadmin">
		<svelte:fragment slot="trailing"><Tag label="Mockup" icon="fa-flask" tooltip="Example data only. Analysis is not connected yet." /></svelte:fragment>
	</PanelHeader>
	<div class="analysis__body" use:navigationScroll={`analysis__body`}>
		<div class="analysis__stats">
			<DashboardStatCard label="Players analyzed" value="1,248" caption="Example players" icon="fa-users" />
			<DashboardStatCard label="Vectors created" value="3,744" caption="Example vectors" icon="fa-fingerprint" />
			<DashboardStatCard label="Game servers" value="32" caption="Example servers" icon="fa-server" />
		</div>
		<div class="analysis__tiles">
			{#each tiles as tile}
				<button type="button" class:active={selected?.id === tile.id} aria-pressed={selected?.id === tile.id} data-uisfx="select" on:click={() => void navigation.visit(() => { selected = tile })}>
					<i class={`fa-solid ${tile.icon}`} aria-hidden="true"></i>
					<span><strong>{tile.title}</strong><small>{tile.description}</small></span>
					<i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
				</button>
			{/each}
		</div>
		<p aria-live="polite">{selected ? `${selected.title} selected. This is a mockup; live analysis is not connected yet.` : `Example data only. Select a tile to preview an analysis area.`}</p>
	</div>
</section>

<style lang="scss">
	.analysis { box-sizing: border-box; height: 100%; display: grid; grid-template-rows: auto minmax(0, 1fr); gap: var(--gutter-lg); padding-top: var(--gutter-lg); }
	.analysis__body { min-height: 0; display: grid; align-content: start; gap: var(--gutter-lg); overflow: auto; padding: 0 var(--gutter-lg) var(--gutter-lg); }
	.analysis__stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--gutter-md); }
	.analysis__tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gutter-md); }
	button { min-width: 0; display: flex; align-items: center; gap: var(--gutter-md); text-align: left; padding: var(--gutter-lg); border: 1px solid var(--color-dark-secondary); border-radius: var(--radius); background: rgbaa(var(--color-dark-primary), 0.34); color: var(--color-light-primary); }
	button:hover, button:focus-visible, button.active { border-color: var(--color-accent-primary); }
	button > i { color: var(--color-accent-primary); }
	button > i:last-child { margin-left: auto; font-size: var(--font-size-xs); }
	button span { display: grid; gap: var(--gutter-sm); }
	small, p { color: var(--color-light-tertiary); font-size: var(--font-size-xs); }
	p { margin: 0; }
	@media (max-width: 700px) { .analysis__stats, .analysis__tiles { grid-template-columns: 1fr; } }
</style>
