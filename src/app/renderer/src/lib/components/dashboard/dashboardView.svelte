<script lang="ts">
	import { onDestroy, tick } from "svelte";
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import EmptyState from "$lib/components/ui/EmptyState.svelte";
	import InfoNotice from "$lib/components/ui/infoNotice.svelte";
	import DashboardLiveStrip from "./dashboardLiveStrip.svelte";
	import DashboardRankingCard from "./dashboardRankingCard.svelte";
	import DashboardProtectionCard from "./dashboardProtectionCard.svelte";
	import DashboardScopeControls from "./dashboardScopeControls.svelte";
	import DashboardMoneyCard from "./dashboardMoneyCard.svelte";
	import DashboardStatCard from "./dashboardStatCard.svelte";
	import DashboardActionBreakdown from "./dashboardActionBreakdown.svelte";
	import DashboardTimeline from "./dashboardTimeline.svelte";
	import AnimatedNumber from "$lib/components/ui/animatedNumber.svelte";
	import { SFX } from "$lib/global/sfx";
	import { createDashboardMoneyCue } from "./dashboardMoneyCue";
	import { createDashboardPresentation } from "./dashboardPresentation";
	import { dashboardQueryKey } from "./dashboardViewModel";
	import { stopCelebration } from "$lib/utils/celebrate";
	import { dashboardSeriesColor } from "./dashboardTimelineData";
	import { profileCommandAppearance } from "$lib/utils/profileActions";
	import type { DashboardViewState } from "./dashboardState";
	import type {
		DashboardDataSource,
		DashboardEntity,
		DashboardViewQuery,
	} from "./dashboardViewModel";
	let {
		state: viewState,
		source,
		onQueryChange,
		onRetry,
		onOpen,
		now,
	}: {
		state: DashboardViewState;
		source: DashboardDataSource;
		onQueryChange: (query: DashboardViewQuery) => void;
		onRetry: () => void;
		onOpen: (entity: DashboardEntity) => void;
		now?: Date;
	} = $props();
	let teams = $state.raw<readonly DashboardEntity[]>([]);
	let overview: HTMLDivElement;
	let body: HTMLDivElement;
	let loadingHeight = $state(0);
	let pendingScroll: number | null = null;
	let pendingFocus: string | null = null;
	const data = $derived(viewState.data);
	const presentation = $derived(
		data ? createDashboardPresentation(data, now) : null,
	);
	const observeMoney = createDashboardMoneyCue(() => SFX.play(`reward`));
	onDestroy(stopCelebration);
	$effect(() => {
		if (data) teams = data.teams;
		observeMoney(data);
	});
	function changeQuery(query: DashboardViewQuery) {
		if (dashboardQueryKey(query) === dashboardQueryKey(viewState.query)) return;
		pendingScroll = body?.scrollTop ?? 0;
		loadingHeight = body?.scrollHeight ?? 0;
		const focused = document.activeElement;
		pendingFocus =
			focused instanceof HTMLElement && overview?.contains(focused) ?
				focused instanceof HTMLInputElement ?
					`input[type="radio"][value="${CSS.escape(focused.value)}"]`
				: focused.id ? `#${CSS.escape(focused.id)}`
				: null
			:	null;
		onQueryChange(query);
	}
	async function restorePosition(position: number, focus: string | null) {
		await tick();
		if (!body) return;
		body.scrollTop = position;
		if (focus)
			overview
				?.querySelector<HTMLElement>(focus)
				?.focus({ preventScroll: true });
	}
	$effect(() => {
		if (
			data &&
			dashboardQueryKey(data.query) === dashboardQueryKey(viewState.query) &&
			pendingScroll !== null
		) {
			const position = pendingScroll;
			const focus = pendingFocus;
			pendingScroll = null;
			pendingFocus = null;
			loadingHeight = 0;
			void restorePosition(position, focus);
		} else if (!data && viewState.error) {
			pendingScroll = null;
			pendingFocus = null;
			loadingHeight = 0;
			if (body) body.scrollTop = 0;
		}
	});
</script>

<section class="dashboard" aria-label="Dashboard">
	<div class="overview" bind:this={overview}>
		<div class="heading">
			<PanelHeader title="Dashboard" eyebrow="Real-time statistics">
				<svelte:fragment slot="eyebrow"
					><span class="loading-subtitle" role="status" aria-live="polite"
						>{#if viewState.loading && data}<i
								class="fa-solid fa-spinner fa-spin"
								aria-hidden="true"
							></i> Loading...{:else}Real-time statistics{/if}</span
					></svelte:fragment
				>
				<svelte:fragment slot="trailing"
					><div class="status">
						<DashboardScopeControls
							query={viewState.query}
							{teams}
							onChange={changeQuery}
						/>
						<div
							class="refresh"
							class:refresh--stale={viewState.error}
							aria-label={viewState.error ? `Last refresh failed`
							: viewState.loading ? `Refreshing dashboard`
							: `Next refresh in ${viewState.secondsUntilRefresh}s`}
						>
							{#key data}<i class:updated={Boolean(data)} aria-hidden="true"
								></i>{/key}<small>{viewState.secondsUntilRefresh ?? 0}s</small>
						</div>
					</div></svelte:fragment
				>
			</PanelHeader>
		</div>
		<div class="body" bind:this={body} aria-busy={viewState.loading}>
			{#if !data || !presentation}
				<div
					class="initial"
					style:min-height={loadingHeight ? `${loadingHeight}px` : undefined}
					aria-live="polite"
				>
					<EmptyState
						title={viewState.error ?
							`Couldn't load your dashboard`
						:	`Getting your dashboard ready`}
						message={viewState.error ?
							`Give it another try in a moment.`
						:	`Let's see what the community's been up to.`}
					/>{#if viewState.error}<Button
							label="Retry"
							icon="fa-rotate-right"
							onClick={onRetry}
							disabled={viewState.loading}
						/>{/if}
				</div>
			{:else}
				{#if viewState.error}<div role="status">
						<InfoNotice
							message="Couldn't refresh just now. Your last update is still here."
						/><Button
							label="Retry"
							size="sm"
							onClick={onRetry}
							disabled={viewState.loading}
						/>
					</div>{/if}
				<div class="impact" aria-label={`${presentation.scope} statistics`}>
					<DashboardMoneyCard
						metrics={data.metrics}
						currency={presentation.currency}
						count={presentation.count}
					/>
					<div class="stat-grid">
						<DashboardStatCard
							label="Cheater bans"
							value={data.metrics.cheaterBans}
							formatValue={presentation.count}
							animate
							caption="Money well wasted"
							icon={profileCommandAppearance.ban.icon}
							iconType="light"
							iconColor={dashboardSeriesColor(`ban`)}
							variant="impact"
							tone="danger"
						/>
						<DashboardStatCard
							label="Wanted bans"
							value={data.metrics.wantedBans}
							formatValue={presentation.count}
							animate
							caption={`${presentation.count(data.metrics.applications)} bans across servers`}
							icon="fa-crosshairs"
							iconColor={dashboardSeriesColor(`ban`)}
							variant="impact"
							><svelte:fragment slot="caption"
								><AnimatedNumber
									value={data.metrics.applications}
									formatValue={presentation.count}
								/> bans across servers</svelte:fragment
							></DashboardStatCard
						>
						<DashboardStatCard
							label="Actions performed"
							value={data.metrics.actions}
							formatValue={presentation.count}
							animate
							caption={`You made ${presentation.count(data.metrics.contribution)} happen`}
							icon="fa-bolt"
							variant="impact"
							><svelte:fragment slot="caption"
								>You made <AnimatedNumber
									value={data.metrics.contribution}
									formatValue={presentation.count}
								/> happen</svelte:fragment
							></DashboardStatCard
						>
						<DashboardStatCard
							label="Protected servers"
							value={data.metrics.servers}
							formatValue={presentation.count}
							animate
							caption="Getting some community love"
							icon="fa-server"
							variant="impact"
							tone="blue"
						/>
					</div>
					<DashboardActionBreakdown
						totals={data.breakdown}
						count={presentation.count}
					/>
				</div>
				<DashboardLiveStrip live={data.live} age={presentation.age} {onOpen} />
				<section
					class="scoreboards"
					aria-label={`${presentation.scope} contribution scoreboards`}
				>
					<div class="scoreboard-grid">
						<DashboardRankingCard
							title="Top admins"
							rows={data.scoreboards.admins}
							viewerId={data.viewerId}
							viewerRank={data.scoreboards.viewerRank.admins}
							scopeKey={dashboardQueryKey(data.query)}
						/>
						<DashboardRankingCard
							title="Most active"
							rows={data.scoreboards.active}
							viewerId={data.viewerId}
							viewerRank={data.scoreboards.viewerRank.active}
							scopeKey={dashboardQueryKey(data.query)}
						/>
						<DashboardRankingCard
							title="Top teams"
							rows={data.scoreboards.teams}
							viewerId={data.viewerId}
							scopeKey={dashboardQueryKey(data.query)}
						/>
						<DashboardProtectionCard
							protection={data.scoreboards.protection}
							{onOpen}
						/>
					</div>
				</section>
				{#key dashboardQueryKey(data.query)}<DashboardTimeline
						timeline={data.timeline}
						{source}
						query={data.query}
						caption={presentation.scope}
						onSelect={(timeline) =>
							changeQuery({ ...viewState.query, timeline })}
					/>{/key}
			{/if}
		</div>
	</div>
</section>

<style lang="scss">
	.dashboard {
		height: 100%;
		min-height: 0;
		min-width: 0;
		container: dashboard / inline-size;
		user-select: none;
	}
	.dashboard :global(input),
	.dashboard :global(textarea),
	.dashboard :global([contenteditable="true"]) {
		user-select: text;
	}
	.overview {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}
	.heading {
		padding: 26px 26px 18px;
		flex-shrink: 0;
	}
	.heading :global(.panel-header) {
		margin: 0;
		align-items: center;
		flex-wrap: wrap;
	}
	.heading :global(.panel-header__identity) {
		flex: 0 0 auto;
	}
	.heading :global(.panel-header__trailing) {
		flex: 1 1 auto;
		min-width: 0;
		justify-content: flex-end;
	}
	.heading :global(.panel-header__title) {
		font-size: 24px;
	}
	.heading :global(.panel-header__eyebrow) {
		font-size: var(--font-size-caption);
	}
	.loading-subtitle {
		display: inline-flex;
		align-items: center;
		gap: var(--gutter-sm);
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: var(--gutter-md);
		overflow: auto;
		min-height: 0;
		padding: 0 26px 26px;
	}
	.body > :global(*) {
		flex-shrink: 0;
	}
	.status {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 12px;
		min-width: 0;
		font-size: var(--font-size-caption);
	}
	.refresh {
		display: flex;
		align-items: center;
		gap: 7px;
		flex-shrink: 0;
	}
	.refresh i {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--color-accent-secondary);
		box-shadow: 0 0 9px rgbaa(var(--color-accent-secondary), 0.3);
	}
	.refresh i.updated {
		animation: refresh-pulse 6500ms var(--easing);
	}
	.refresh--stale i {
		background: var(--color-accent-tertiary);
		box-shadow: none;
	}
	.refresh small {
		font-size: var(--font-size-caption);
		width: 18px;
		font-variant-numeric: tabular-nums;
	}
	@keyframes refresh-pulse {
		from {
			box-shadow: 0 0 0 0 rgbaa(var(--color-accent-secondary), 0.75);
			transform: scale(1.45);
		}
		to {
			box-shadow: 0 0 0 8px rgbaa(var(--color-accent-secondary), 0);
			transform: scale(1);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.refresh i.updated {
			animation: none;
		}
	}
	.scoreboard-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}
	.stat-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 10px;
	}
	.impact {
		display: grid;
		gap: var(--gutter-md);
	}
	.initial {
		display: grid;
		justify-items: center;
		align-content: start;
		gap: 15px;
		padding-top: 30px;
	}
	@container dashboard (max-width: 760px) {
		.scoreboard-grid {
			grid-template-columns: 1fr;
		}
		.stat-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@container dashboard (max-width: 480px) {
		.stat-grid {
			grid-template-columns: 1fr;
		}
		.body {
			padding: 0 16px 20px;
		}
		.heading {
			padding: 22px 16px 16px;
		}
	}
</style>
