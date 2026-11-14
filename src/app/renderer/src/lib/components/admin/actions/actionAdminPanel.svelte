<script lang="ts">
	import { onMount, onDestroy } from "svelte"
	import { ActionRunsController, type ActionRunDetail, type ActionRunsPage } from "./actionRunsController"
	import PaginationControls from "$lib/components/ui/PaginationControls.svelte"
	import { actionsApi } from "$lib/utils/actionsApi";
	import Button from "$lib/components/ui/Button.svelte";
	import Input from "$lib/components/ui/Input.svelte";
	import Select from "$lib/components/ui/Select.svelte";
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte";
	import EmptyState from "$lib/components/ui/EmptyState.svelte";
	import Tag from "$lib/components/ui/Tag.svelte";
	import Tabs from "$lib/components/ui/tabs.svelte";
	import { navigationScroll } from "$lib/navigation/navigation";
	import ActionRequestPanel from "$lib/components/requests/actionRequestPanel.svelte";
	import WantedAdminPanel from "../WantedAdminPanel.svelte";
	const tabs = [
		{ value: `runs`, label: `Action runs` },
		{ value: `rules`, label: `Rule testing` },
		{ value: `requests`, label: `Test a request` },
		{ value: `wanted`, label: `Wanted tools` },
	];
	let tab = `runs`;
	const controller = new ActionRunsController(query => actionsApi<ActionRunsPage>(`admin`, query), value => state = value)
	let state = controller.state
	let busy = false;
	let liveKey = crypto.randomUUID();
	let origin = ``;
	let mock = ``;
	let error = ``;
	let status = ``;
	let serverId = ``;
	let ruleId = ``;
	let preview: unknown = null;
	let rerunTarget: ActionRunDetail | null = null;
	onMount(() => {
		void load();
	});
	onDestroy(() => controller.cancel())
	async function load(page = state.meta.currentPage) {
		rerunTarget = null
		await controller.load({ ...(status ? { status } : {}), ...(serverId ? { gameServerId: serverId } : {}), ...(origin ? { origin } : {}), ...(mock ? { mock } : {}), ...(ruleId ? { ruleId } : {}) }, page)
	}
	async function control(operation: string, input = {}) {
		if (busy) return;
		busy = true
		error = ``
		try {
			const result = await actionsApi(`control`, { operation, ...input });
			if (operation === `preview`) {
				preview = result;
				liveKey = crypto.randomUUID();
			}
			await load();
		} catch (value) {
			error = String(value);
		} finally {
			busy = false;
		}
	}
</script>

<section class="action-admin panel-subview" class:action-admin--runs={tab === `runs`} aria-label="Action administration">
	<div class="action-admin__filters">
		<div class="action-admin__toolbar">
			<Tag
				label={state.paused ? `Paused` : `Running`}
				icon={state.paused ? `fa-pause` : `fa-spin-snap-8 fa-cog`}
			/>
			<div class="action-admin__buttons">
				<Button
					label={state.paused ? `Resume production` : `Pause production`}
					icon={state.paused ? `fa-play` : `fa-pause`}
					disabled={busy || state.loading}
					onClick={() => void control(state.paused ? `resume` : `pause`)}
				/>
				<Button
					label="Refresh"
					icon="fa-rotate"
					disabled={busy || state.loading}
					onClick={() => void load()}
				/>
			</div>
		</div>
	</div>

	<div class="action-admin__body" use:navigationScroll={`admin-actions`}>
		{#if error || state.error}<p class="action-admin__notice" role="alert">{error || state.error}</p>{/if}

		<Tabs
			items={tabs}
			value={tab}
			label="Action administration"
			onChange={(value) => (tab = value)}
		>
			{#if tab === `runs`}
				<div class="action-admin__fields">
					<Input
						label="Server ID"
						value={serverId}
						onChange={(value) => {
							serverId = value;
							preview = null
							void load(1)
						}}
					/>
					<Input
						label="Rule ID"
						value={ruleId}
						onChange={(value) => {
							ruleId = value;
							preview = null
							void load(1)
						}}
					/>
					<Select
						label="Status"
						value={status}
						options={[
							``,
							`pending`,
							`claimed`,
							`submitting`,
							`completed`,
							`failed`,
							`unknown`,
							`expired`,
							`cancelled`,
							`superseded`,
						].map((value) => ({ value, label: value || `All` }))}
						onChange={(value) => {
							status = value;
							void load(1)
						}}
					/>
					<Select
						label="Source"
						value={origin}
						options={[``, `request`, `rule`, `wanted`].map((value) => ({
							value,
							label: value || `All sources`,
						}))}
						onChange={(value) => {
							origin = value;
							void load(1)
						}}
					/>
					<Select
						label="Test flag"
						value={mock}
						options={[
							{ value: ``, label: `All` },
							{ value: `true`, label: `Mock only` },
							{ value: `false`, label: `Real actions` },
						]}
						onChange={(value) => {
							mock = value;
							void load(1)
						}}
					/>
				</div>
				<section class="action-admin__section" aria-label="Action runs" aria-busy={state.loading}>
					<PanelHeader variant="section" title="Action runs">
						<svelte:fragment slot="trailing"
							><span class="action-admin__count">{state.meta.totalResults} runs</span
							></svelte:fragment
						>
					</PanelHeader>
					{#if rerunTarget}
						<div class="action-admin__notice">
							<p>
								Run #{rerunTarget.id} may already have sent commands. Running again
								creates a separate live action.
							</p>
							<div class="action-admin__buttons">
								<Button
									label="Confirm new run"
									variant="danger"
									onClick={() => {
										if (rerunTarget)
											void control(`rerun`, {
												runId: rerunTarget.id,
												requestKey: crypto.randomUUID(),
											});
										rerunTarget = null;
									}}
								/>
								<Button label="Cancel" onClick={() => (rerunTarget = null)} />
							</div>
						</div>
					{/if}
					{#each state.runs as run (run.id)}
						<details class="action-admin__run">
							<summary>
								<span class="action-admin__identity"
									><strong>Run #{run.id}</strong><span
										>{run.origin}{run.mock ? ` (Mock)` : ``} / Server {run.gameServerId}</span
									></span
								>
								<Tag label={run.status} />
								<i
									class="fa-solid fa-chevron-down action-admin__chevron"
									aria-hidden="true"
								></i>
							</summary>
							<div class="action-admin__details">
								<pre>{JSON.stringify(run, null, 2)}</pre>
								<div class="action-admin__buttons">
									<Button
										label="Cancel run"
										icon="fa-xmark"
										onClick={() => void control(`cancel`, { runId: run.id })}
									/>
									<Button
										label="Run again"
										icon="fa-rotate-right"
										disabled={![
											"failed",
											"unknown",
											"expired",
											"cancelled",
										].includes(run.status)}
										onClick={() => (rerunTarget = run)}
									/>
								</div>
							</div>
						</details>
					{:else}
						{#if state.loading}<p role="status">Loading action runs...</p>
						{:else if !error && !state.error}<EmptyState
								title="No action runs"
								message="Runs matching the selected filters will appear here."
							/>{/if}
					{/each}
				</section>
			{:else if tab === `rules`}
				<section class="action-admin__section" aria-label="Rule testing">
					<PanelHeader variant="section" title="Rule testing" />
					<p class="action-admin__hint">
						Choose a server and rule, then preview the targets before running a
						live action.
					</p>
					<div class="action-admin__fields">
						<Input
							label="Server ID"
							value={serverId}
							onChange={(value) => {
								serverId = value;
								preview = null;
							}}
						/>
						<Input
							label="Rule ID"
							value={ruleId}
							onChange={(value) => {
								ruleId = value;
								preview = null;
							}}
						/>
					</div>
					<div class="action-admin__buttons">
						<Button
							label="Preview rule"
							icon="fa-eye"
							disabled={!ruleId || !serverId}
							onClick={() =>
								void control(`preview`, {
									ruleId: Number(ruleId),
									gameServerId: Number(serverId),
								})}
						/>
						<Button
							label="Run rule live once"
							icon="fa-play"
							variant="danger"
							disabled={busy || !preview || !ruleId || !serverId}
							onClick={() =>
								void control(`runRule`, {
									ruleId: Number(ruleId),
									gameServerId: Number(serverId),
									requestKey: liveKey,
								})}
						/>
					</div>
					{#if preview}<pre>{JSON.stringify(preview, null, 2)}</pre>{/if}
				</section>
			{:else if tab === `requests`}
				<ActionRequestPanel embedded />
			{:else if tab === `wanted`}
				<WantedAdminPanel active={true} />
			{/if}
		</Tabs>
	</div>
	{#if tab === `runs`}
		<div class="action-admin__pagination">
			<PaginationControls currentPage={state.meta.currentPage} totalPages={state.meta.totalPages} hasPrevious={state.meta.hasPrevious} hasNext={state.meta.hasNext} disabled={busy || state.loading} onPrevious={() => void load(state.meta.currentPage - 1)} onNext={() => void load(state.meta.currentPage + 1)} />
		</div>
	{/if}
</section>

<style lang="scss">
	.action-admin {
		min-width: 0;
		min-height: 0;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		gap: var(--gutter-lg);
	}

	.action-admin--runs { grid-template-rows: auto minmax(0, 1fr) auto; }
	.action-admin__pagination { padding: 0 var(--gutter-lg) var(--gutter-lg); }

	.action-admin__filters {
		display: grid;
		margin: 0 var(--gutter-lg);
		gap: var(--gutter);
	}

	.action-admin__toolbar,
	.action-admin__buttons {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--gutter-sm);
	}

	.action-admin__toolbar {
		justify-content: space-between;
	}

	.action-admin__fields {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
		gap: var(--gutter-md);
	}

	.action-admin__body {
		min-height: 0;
		display: grid;
		align-content: start;
		overflow: hidden auto;
		gap: var(--gutter-lg);
		padding: 0 var(--gutter-lg) var(--gutter-lg);
	}

	.action-admin__section,
	.action-admin__details,
	.action-admin__notice {
		display: grid;
		gap: var(--gutter-md);
	}
	.action-admin__count,
	.action-admin__hint,
	.action-admin__identity > span {
		color: var(--color-light-secondary);
		font-size: var(--font-size-xs);
	}
	p {
		margin: 0;
	}

	.action-admin__run {
		min-width: 0;
		border: 1px solid var(--color-dark-tertiary);
		border-radius: var(--radius);
		background: var(--color-dark-primary);
	}

	summary {
		display: flex;
		align-items: center;
		gap: var(--gutter-md);
		padding: var(--gutter-md);
		list-style: none;
		cursor: pointer;
	}

	summary::-webkit-details-marker {
		display: none;
	}
	summary:focus-visible {
		outline: 2px solid var(--color-accent-primary);
		outline-offset: -2px;
		border-radius: var(--radius);
	}
	.action-admin__identity {
		min-width: 0;
		flex: 1;
		display: grid;
		gap: var(--gutter-sm);
		overflow-wrap: anywhere;
	}
	.action-admin__chevron {
		color: var(--color-light-secondary);
		font-size: var(--font-size-xs);
	}
	details[open] > summary .action-admin__chevron {
		transform: rotate(180deg);
	}
	.action-admin__details {
		padding: 0 var(--gutter-md) var(--gutter-md);
	}
	.action-admin__notice {
		border: 1px solid var(--color-accent-tertiary);
		border-radius: var(--radius);
		padding: var(--gutter-md);
		font-size: var(--font-size-xs);
	}

	pre {
		min-width: 0;
		max-height: 280px;
		margin: 0;
		padding: var(--gutter-md);
		overflow: auto;
		border-radius: var(--radius);
		background: var(--color-dark-secondary);
		color: var(--color-light-secondary);
		font-size: var(--font-size-xs);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
</style>
