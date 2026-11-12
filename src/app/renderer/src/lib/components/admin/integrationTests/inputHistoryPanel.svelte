<script lang="ts">
	import { onDestroy } from 'svelte'
	import { getCoreApi } from '$lib/core'
	import { unwrap } from '$lib/utils/apiResult'
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import { InputHistoryController, type InputConfig } from './inputHistoryController'

	export let active = false
	const controller = new InputHistoryController(
		async () => unwrap<InputConfig>(await getCoreApi().inputConfig(), `Could not read Input.ini.`),
		next => { state = next }
	)
	let state = controller.state
	$: controller.setActive(active)
	onDestroy(() => controller.setActive(false))
</script>

<section class="input-history" aria-label="Input.ini console history" aria-busy={state.loading}>
	<header>
		<h2>Console history</h2>
		<p>Last 10 entries from Input.ini. Newest at the bottom. Refreshes every second while this tab is open.</p>
		<code>%LOCALAPPDATA%\Chivalry 2\Saved\Config\WindowsNoEditor\Input.ini</code>
	</header>
	<div class="input-history__info">
		<span>{state.rows.length} shown · {state.total} in history</span>
		<span>Last read: {state.updatedAt === null ? `—` : new Date(state.updatedAt).toLocaleTimeString()}</span>
	</div>
	{#if state.error}<p class="input-history__error" role="alert">{state.error}</p>{/if}
	{#if state.rows.length}
		<div class="input-history__table">
			<table>
				<thead><tr><th scope="col">#</th><th scope="col">Action</th><th scope="col">Info / arguments</th></tr></thead>
				<tbody>
					{#each state.rows as row (row.index)}
						<tr><td>{row.index}</td><td><code>{row.action}</code></td><td class="input-history__arguments">{row.info || `—`}</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else if !state.error}
		<EmptyState title={state.loading ? `Reading console history` : `No console history`} message={state.loading ? `Loading Input.ini.` : `HistoryBuffer entries will appear here when they are saved in Input.ini.`} />
	{/if}
</section>

<style lang="scss">
	.input-history { display: grid; gap: var(--gutter-lg); min-width: 0; }
	h2, p { margin: 0; }
	header { display: grid; gap: var(--gutter-sm); }
	p, header code, .input-history__info { color: var(--color-light-secondary); font-size: var(--font-size-xs); }
	header code { overflow-wrap: anywhere; }
	.input-history__info { display: flex; flex-wrap: wrap; gap: var(--gutter-md); justify-content: space-between; }
	.input-history__error { color: var(--color-accent-tertiary); }
	.input-history__table { overflow-x: auto; border: 1px solid var(--color-dark-tertiary); border-radius: var(--radius); }
	table { width: 100%; border-collapse: collapse; text-align: left; font-size: var(--font-size-xs); }
	th, td { padding: var(--gutter-md); vertical-align: top; }
	th { color: var(--color-light-secondary); background: var(--color-dark-secondary); font-weight: var(--font-weight-medium); }
	td { border-top: 1px solid var(--color-dark-tertiary); }
	td:first-child { color: var(--color-light-secondary); }
	td:nth-child(2) { white-space: nowrap; }
	.input-history__arguments { width: 100%; white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
