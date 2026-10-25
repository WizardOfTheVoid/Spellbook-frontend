<script lang="ts">
	import type { DebugControlApi, DebugProducer, DebugSessionSnapshot } from '../../../../../shared/debug'

	export let api: DebugControlApi
	export let state: DebugSessionSnapshot
	let values: Record<string, number> = {}
	let loaded = false
	let error = ``
	let notice = ``
	let busy = false
	const producers: { key: DebugProducer, label: string }[] = [
		{ key: `listPlayers`, label: `ListPlayers polling` }, { key: `actions`, label: `Wanted worker` }, { key: `antiAfk`, label: `Anti-AFK` }
	]
	$: if (!loaded && state.core) {
		values = { ...state.core.settings }
		loaded = true
	}

	async function perform(action: () => Promise<void>): Promise<void> {
		busy = true
		error = ``
		notice = ``
		try { await action() }
		catch (reason) { error = reason instanceof Error ? reason.message : String(reason) }
		finally { busy = false }
	}

	async function apply(save = false, reset = false): Promise<void> {
		await api.settings(reset ? {} : values, save, reset)
		const fresh = await api.getState()
		if (fresh.core) values = { ...fresh.core.settings }
		notice = reset ? `Restored saved timings.` : save ? `Timing values saved to the active Core .env.` : `Temporary timings applied.`
	}
</script>

<div class="environment">
	<h2>Producer suspension</h2>
	<p>Pause producers independently during tests. Stop tests restores their normal behavior.</p>
	<div class="producers">
		{#each producers as producer}
			<label><input type="checkbox" checked={state.pausedProducers[producer.key]} disabled={!state.enabled || busy} on:change={(event) => perform(() => api.setProducerPaused(producer.key, event.currentTarget.checked))} /> Pause {producer.label}</label>
		{/each}
	</div>
	<h2>Core timing settings</h2>
	<p>Values are milliseconds from the loaded Core configuration. Apply is temporary. Save to .env writes only these timing keys.</p>
	{#if !state.core}<p>Connect to Core to inspect and edit its timing values.</p>{/if}
	<fieldset disabled={busy || !state.core}>
		{#each Object.entries(values) as [key]}
			<label><code>{key}</code><input type="number" min="0" max="3600000" bind:value={values[key]} /><small>Effective: {state.core?.settings[key] ?? `-`} ms</small></label>
		{/each}
	</fieldset>
	<div class="toolbar">
		<button type="button" disabled={busy || !state.core} on:click={() => perform(() => apply())}>Apply temporary</button>
		<button type="button" disabled={busy || !state.core} on:click={() => perform(() => apply(true))}>Save to .env</button>
		<button type="button" disabled={busy || !state.core} on:click={() => perform(() => apply(false, true))}>Reset to saved</button>
	</div>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	{#if notice}<p role="status">{notice}</p>{/if}
</div>

<style>
	.environment { display: grid; gap: 14px; }
	h2 { margin: 0; font-size: 15px; }
	.producers, .toolbar { display: flex; flex-wrap: wrap; gap: 14px; }
	.producers label { display: flex; align-items: center; gap: 6px; }
	fieldset { margin: 0; padding: 0; border: 0; display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
	fieldset label { display: grid; gap: 5px; }
	code { overflow-wrap: anywhere; }
	input[type=number] { width: 100%; }
	small { color: #8995a8; }
	@media (max-width: 640px) { fieldset { grid-template-columns: 1fr; } }
</style>
