<script lang="ts">
	import type { DebugControlApi, DebugLayout, DebugPanelName } from '../../../../../shared/debug'
	import { createDebugLayout } from '../../../../../shared/debugPresets'

	export let api: DebugControlApi
	export let layout: DebugLayout
	let draft = structuredClone(layout)
	let error = ``
	let notice = ``
	let busy = false
	const panels: DebugPanelName[] = [`tests`, `queue`, `state`, `events`]

	async function apply(reset = false): Promise<void> {
		busy = true
		error = ``
		notice = ``
		try {
			const next = reset ? createDebugLayout() : draft
			await api.configure(next)
			draft = structuredClone(next)
			notice = reset ? `Default layout restored.` : `Panel layout saved.`
		} catch (reason) { error = reason instanceof Error ? reason.message : String(reason) }
		finally { busy = false }
	}
</script>

<div class="layout-controls">
	<p>Game panels are click-through. Position uses the available space: 0 is the top / left edge, 1 is the bottom / right edge.</p>
	<fieldset disabled={busy}>
		{#each panels as name}
			<div class="panel-row">
				<label class="visibility"><input type="checkbox" bind:checked={draft[name].visible} /><strong>{name}</strong></label>
				<label>X (0–1)<input type="number" min="0" max="1" step="0.01" bind:value={draft[name].x} /></label>
				<label>Y (0–1)<input type="number" min="0" max="1" step="0.01" bind:value={draft[name].y} /></label>
				<label>Scale<input type="number" min="0.5" max="2" step="0.05" bind:value={draft[name].scale} /></label>
				<label>Opacity<input type="number" min="0.1" max="1" step="0.05" bind:value={draft[name].opacity} /></label>
			</div>
		{/each}
	</fieldset>
	<div class="toolbar"><button type="button" disabled={busy} on:click={() => apply()}>Apply layout</button><button type="button" disabled={busy} on:click={() => apply(true)}>Reset default layout</button></div>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	{#if notice}<p role="status">{notice}</p>{/if}
</div>

<style>
	.layout-controls, fieldset { display: grid; gap: 16px; }
	fieldset { margin: 0; padding: 0; border: 0; }
	.panel-row { display: grid; grid-template-columns: 110px repeat(4, minmax(0, 1fr)); gap: 10px; align-items: center; }
	label { display: grid; gap: 5px; }
	.visibility { display: flex; gap: 8px; text-transform: capitalize; }
	input[type=number] { width: 100%; min-width: 0; }
	.toolbar { display: flex; flex-wrap: wrap; gap: 10px; }
	@media (max-width: 640px) { .panel-row { grid-template-columns: repeat(4, minmax(0, 1fr)); } .visibility { grid-column: 1 / -1; } }
</style>
