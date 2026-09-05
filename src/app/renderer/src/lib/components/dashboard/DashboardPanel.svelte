<script lang="ts">
	import { onMount } from "svelte"
	import Button from "$lib/components/ui/Button.svelte"
	import EmptyState from "$lib/components/ui/EmptyState.svelte"
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte"
	import Tag from "$lib/components/ui/Tag.svelte"
	import { tooltip } from "$lib/utils/tooltip"
	import DashboardTimeline from "./DashboardTimeline.svelte"
	import TabbedListCard from "./TabbedListCard.svelte"
	import { createDashboardController, type DashboardViewState } from "./dashboardState"

	export let onOpenYourServers: () => void = () => {}

	const adminTabs = [
		{ id: `individuals`, label: `Individuals`, icon: `fa-user`, tooltip: `Global individual admin ranking for the last 30 days.` },
		{ id: `teams`, label: `Teams`, icon: `fa-people-group`, tooltip: `Global team ranking for the last 30 days.` },
	]
	const actionTabs = [
		{ id: `bans`, label: `Bans`, icon: `fa-ban`, tooltip: `Latest visible player bans.` },
		{ id: `kicks`, label: `Kicks`, icon: `fa-person-walking-arrow-right`, tooltip: `Latest visible player kicks.` },
		{ id: `unbans`, label: `Unbans`, icon: `fa-unlock`, tooltip: `Latest visible player unbans.` },
	]
	let selectedAdminTab = `individuals`
	let selectedActionTab = `bans`
	let state: DashboardViewState = { loading: true, error: null, data: null, secondsUntilRefresh: null }
	$: data = state.data
	$: admins = data
		? selectedAdminTab === `teams` ? data.leaderboards.teams : data.leaderboards.individuals
		: []
	$: actions = data
		? selectedActionTab === `kicks`
			? data.recentActions.kicks
			: selectedActionTab === `unbans`
				? data.recentActions.unbans
				: data.recentActions.bans
		: []
	const controller = createDashboardController({ onChange: value => { state = value } })

	onMount(() => {
		controller.start()
		return () => controller.destroy()
	})
</script>

<section class="panel-view dashboard" aria-label="Dashboard">
	<PanelHeader title="Dashboard" eyebrow="Overview">
		<svelte:fragment slot="trailing">
			{#if data && state.secondsUntilRefresh !== null}
				<small>Refresh in {state.secondsUntilRefresh}s</small>
			{/if}
			<span class:dashboard__live--loading={state.loading}>
				<Tag label={state.loading ? "Refreshing" : "Live"} icon="fa-chart-line" tooltip="Live statistics refresh every 20 seconds while this page is open." />
			</span>
		</svelte:fragment>
	</PanelHeader>

	{#if !data}
		<div class="dashboard__status" aria-live="polite">
			<EmptyState
				title={state.error ? "Dashboard unavailable" : "Loading Dashboard"}
				message={state.error ?? "Fetching live statistics."}
			/>
			{#if state.error}
				<Button label={state.loading ? "Retrying..." : "Retry"} icon="fa-rotate-right" disabled={state.loading} onClick={() => void controller.load()} />
			{/if}
		</div>
	{/if}

	{#if data}
		<div class="dashboard__body">
			<div class="dashboard__top-grid">
				<button class="dashboard-card dashboard-card--hero dashboard-card--link" type="button" data-uisfx="select" on:click={onOpenYourServers} use:tooltip={"Open your servers in the Servers archive."}>
					<div class="dashboard-card__heading"><span>Your servers</span><i class="fa-solid fa-gamepad"></i></div>
					<strong>{data.yourServers.total}</strong>
					<small>{data.yourServers.online} online · {data.yourServers.total - data.yourServers.online} quiet</small>
					<div class="server-pulse"><i></i><span>{data.yourServers.players} players across your servers</span></div>
				</button>
				<article class="dashboard-card dashboard-card--hero">
					<div class="dashboard-card__heading"><span>Latest player actions</span><i class="fa-solid fa-bolt"></i></div>
					<strong>{data.latestActions.total24Hours}</strong>
					<small>in the last 24 hours</small>
					<div class="dashboard-mini-bars">
						{#each data.latestBarHeights as height}<i style={`height: ${height}`}></i>{/each}
					</div>
				</article>
				<article class="dashboard-card dashboard-card--hero">
					<div class="dashboard-card__heading"><span>Your bans</span><i class="fa-solid fa-ban"></i></div>
					<strong>{data.yourBans.total}</strong>
					<small>{data.yourBans.local} local · {data.yourBans.wantedActions} Wanted actions</small>
					<div class="dashboard-progress"><i style={`width: ${data.localBanWidth}%`}></i></div>
				</article>
			</div>

			<div class="dashboard__stats">
				<article class="dashboard-stat"><span>Global local bans</span><strong>{data.global.localBans.toLocaleString()}</strong><small>recorded human actions</small></article>
				<article class="dashboard-stat"><span>Global Wanted actions</span><strong>{data.global.wantedActions.toLocaleString()}</strong><small>{data.global.wantedServerApplications.toLocaleString()} automatic applications</small></article>
				<article class="dashboard-stat"><span>Global player actions</span><strong>{data.global.playerActions.toLocaleString()}</strong><small>all communities</small></article>
				<article class="dashboard-stat"><span>Active admins</span><strong>{data.global.activeAdmins}</strong><small>across {data.global.activeTeams} active teams</small></article>
			</div>

			<article class="dashboard-card dashboard-chart">
				<div class="dashboard-card__heading"><div><span>Player actions timeline</span><small>Current users and teams · last 14 UTC days</small></div></div>
				<DashboardTimeline labels={data.labels} series={data.timeline.series} />
			</article>

			<div class="dashboard__lower-grid">
				<TabbedListCard title="Top admins" caption="Global · last 30 days" tabs={adminTabs} selected={selectedAdminTab} onSelect={value => (selectedAdminTab = value)}>
					<div class="dashboard-list">
						{#each admins as admin, index}
							<div><b>#{index + 1}</b><span>{admin.name}</span><strong use:tooltip={"Credited player actions."}><i class="fa-solid fa-gavel" aria-hidden="true"></i> {admin.actions}</strong><small>{admin.trend}</small></div>
						{:else}
							<div class="dashboard-list__empty">No credited activity in the last 30 days.</div>
						{/each}
					</div>
				</TabbedListCard>
				<TabbedListCard title="Recent player actions" caption="Latest visible actions" tabs={actionTabs} selected={selectedActionTab} onSelect={value => (selectedActionTab = value)}>
					<div class="dashboard-list dashboard-list--actions">
						{#each actions as item}
							<div>
								<i class={`fa-solid ${item.icon}`} aria-hidden="true" use:tooltip={`${item.subtitle} action.`}></i>
								<span><strong>{item.player}</strong><small>{item.subtitle}</small></span>
								<span class="dashboard-list__labels">
									<i class={`fa-solid ${item.scopeIcon}`} aria-label={item.scopeLabel} use:tooltip={`${item.scopeLabel} action.`}></i>
									{#if item.durationLabel}<small use:tooltip={item.durationTooltip ?? "Ban duration."}><i class="fa-regular fa-clock" aria-hidden="true"></i> {item.durationLabel}</small>{/if}
								</span>
								<time>{item.time}</time>
							</div>
						{:else}
							<div class="dashboard-list__empty">No recent {selectedActionTab}.</div>
						{/each}
					</div>
				</TabbedListCard>
			</div>
		</div>
	{/if}
</section>

<style lang="scss">
	.dashboard { box-sizing: border-box; height: 100%; display: grid; grid-template-rows: auto minmax(0, 1fr); gap: var(--gutter-lg); padding-top: var(--gutter-lg); }
	.dashboard__status { align-self: start; display: grid; justify-items: center; gap: var(--gutter-md); padding: 0 var(--gutter-lg); }
	.dashboard__body { min-height: 0; display: grid; align-content: start; gap: var(--gutter-lg); overflow: auto; padding: 0 var(--gutter-lg) var(--gutter-lg); }
	.dashboard__top-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--gutter-md); }
	.dashboard__stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--gutter-sm); }
	.dashboard__lower-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gutter-md); }
	.dashboard-card,
	.dashboard-stat { min-width: 0; border: 1px solid var(--color-dark-secondary); border-radius: var(--radius); background: rgbaa(var(--color-dark-primary), 0.34); }
	.dashboard-card { padding: var(--gutter-lg); }
	.dashboard-card--hero { display: grid; gap: var(--gutter-sm); text-align: left; }
	.dashboard-card--hero > strong { font-size: 34px; line-height: 1; }
	.dashboard-card--link { color: inherit; cursor: pointer; transition: border-color var(--motion-fast) var(--motion-ease); }
	.dashboard-card--link:hover,
	.dashboard-card--link:focus-visible { border-color: var(--color-accent-primary); }
	.dashboard-card small,
	.dashboard-stat small { color: var(--color-light-tertiary); font-size: var(--font-size-xs); }
	.dashboard-card__heading { display: flex; align-items: center; justify-content: space-between; gap: var(--gutter-md); color: var(--color-light-secondary); font-size: var(--font-size-sm); }
	.dashboard-card__heading > div:first-child { display: grid; gap: 2px; }
	.dashboard-card__heading > i { color: var(--color-accent-primary); }
	.dashboard-stat { display: grid; gap: 4px; padding: var(--gutter-md); }
	.dashboard-stat span { color: var(--color-light-secondary); font-size: var(--font-size-xs); }
	.dashboard-stat strong { font-size: var(--font-size-xl); }
	.server-pulse { display: flex; align-items: center; gap: var(--gutter-sm); margin-top: var(--gutter-sm); color: var(--color-light-tertiary); font-size: var(--font-size-xs); }
	.server-pulse i { width: 7px; height: 7px; border-radius: 50%; background: var(--color-accent-secondary); box-shadow: 0 0 12px var(--color-accent-secondary); }
	.dashboard-progress { height: 4px; margin-top: var(--gutter-sm); overflow: hidden; border-radius: 999px; background: var(--color-dark-secondary); }
	.dashboard-progress i { display: block; height: 100%; background: var(--color-accent-quaternary); }
	.dashboard-mini-bars { height: 30px; display: flex; align-items: end; gap: 4px; margin-top: var(--gutter-sm); }
	.dashboard-mini-bars i { flex: 1; border-radius: 2px 2px 0 0; background: rgbaa(var(--color-accent-primary), 0.6); }
	.dashboard-chart { display: grid; gap: var(--gutter-lg); }
	.dashboard-list { display: grid; }
	.dashboard-list > div { min-width: 0; display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: var(--gutter-md); border-top: 1px solid var(--color-dark-secondary); padding: var(--gutter-md) 0; }
	.dashboard-list > div > b { color: var(--color-light-tertiary); font-size: var(--font-size-xs); }
	.dashboard-list > div > small { color: var(--color-accent-secondary); }
	.dashboard-list > div > strong i { color: var(--color-accent-primary); font-size: var(--font-size-xs); }
	.dashboard-list--actions > div { grid-template-columns: auto minmax(0, 1fr) auto auto; }
	.dashboard-list--actions > div > i { color: var(--color-accent-primary); }
	.dashboard-list--actions > div > span:nth-child(2) { display: grid; gap: 2px; }
	.dashboard-list--actions time { color: var(--color-light-tertiary); font-size: var(--font-size-xs); }
	.dashboard-list__labels { display: flex; align-items: center; justify-content: end; gap: var(--gutter-sm); color: var(--color-light-tertiary); }
	.dashboard-list__labels > i { font-size: var(--font-size-xs); }
	.dashboard-list__labels small { white-space: nowrap; }
	.dashboard-list > .dashboard-list__empty { display: block; color: var(--color-light-tertiary); font-size: var(--font-size-xs); }
	.dashboard__live--loading { animation: dashboard-live-pulse 1.2s var(--motion-ease) infinite; }
	@keyframes dashboard-live-pulse { 50% { opacity: 0.55; filter: drop-shadow(0 0 8px rgbaa(var(--color-accent-primary), 0.5)); } }
	@media (prefers-reduced-motion: reduce) { .dashboard__live--loading { animation: none; } }
	@media (max-width: 950px) {
		.dashboard__top-grid,
		.dashboard__stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.dashboard__lower-grid { grid-template-columns: 1fr; }
	}
</style>
