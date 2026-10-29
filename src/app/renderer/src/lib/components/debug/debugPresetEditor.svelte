<script lang="ts">
	import type { DebugControlApi, DebugPreset } from '../../../../../shared/debug'
	import DebugCommandEditor from './debugCommandEditor.svelte'
	import { debugJson, importPreset } from './debugEditor'

	export let api: DebugControlApi
	export let preset: DebugPreset
	export let enabled = false
	export let running = false
	let draft = structuredClone(preset)
	let json = ``
	let preview = ``
	let error = ``
	let notice = ``
	let busy = false

	async function perform(action: () => Promise<void>): Promise<void> {
		busy = true
		error = ``
		notice = ``
		try { await action() }
		catch (reason) { error = reason instanceof Error ? reason.message : String(reason) }
		finally { busy = false }
	}

	async function save(send = false): Promise<void> {
		await api.savePreset(draft)
		notice = `Preset saved.`
		if (send) await api.run(draft.slot)
	}

	async function importJson(): Promise<void> {
		const candidate = importPreset(json, draft)
		const action = await api.preview(candidate)
		draft = candidate
		preview = debugJson(action)
		notice = `Imported into the editor. Save to keep this preset.`
	}
</script>

<div class="editor">
	<fieldset disabled={busy}>
		<div class="fields">
			<label class="wide">Preset label<input bind:value={draft.label} maxlength="100" /></label>
			<label>Author<select bind:value={draft.author}><option value="user">user</option><option value="system">system</option></select></label>
			<label>Priority<select bind:value={draft.priority}><option value="low">low</option><option value="normal">normal</option><option value="high">high</option></select></label>
		</div>
		<label>Test instructions<textarea rows="2" bind:value={draft.instruction}></textarea></label>
		<DebugCommandEditor bind:commands={draft.commands} disabled={busy} />
		<div class="fields">
			<label>Repeat until pressed again<input type="checkbox" checked={draft.repeat === `infinite`} on:change={(event) => draft.repeat = event.currentTarget.checked ? `infinite` : 1} /></label>
			{#if draft.repeat !== `infinite`}<label>Repeat count<input type="number" min="1" max="100" bind:value={draft.repeat} /></label>{/if}
			<label>Start delay (ms)<input type="number" min="0" max="600000" bind:value={draft.startDelayMs} /></label>
			<label>Repeat interval (ms)<input type="number" min="0" max="600000" bind:value={draft.intervalMs} /></label>
			<label>Action identity<select bind:value={draft.identity}><option value="matching">Matching</option><option value="distinct">Distinct</option></select></label>
		</div>
		<div class="toolbar">
			<button type="button" on:click={() => perform(() => save())}>Save preset</button>
			<button type="button" class="accent" disabled={!enabled} on:click={() => perform(() => running ? api.run(draft.slot) : save(true))}>{running ? `Stop loop` : draft.repeat === `infinite` ? `Save & start loop` : `Save & send test`}</button>
			<button type="button" on:click={() => perform(async () => { preview = debugJson(await api.preview(draft)) })}>Preview Action JSON</button>
		</div>
	</fieldset>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	{#if notice}<p role="status">{notice}</p>{/if}
	<details>
		<summary>Import / export preset JSON</summary>
		<label>Preset or Action JSON<textarea class="json-input" rows="7" bind:value={json}></textarea></label>
		<div class="toolbar">
			<button type="button" disabled={busy || !json.trim()} on:click={() => perform(importJson)}>Import into slot {draft.slot}</button>
			<button type="button" on:click={() => json = debugJson(draft)}>Show preset JSON</button>
		</div>
	</details>
	{#if preview}<details open><summary>Built Action preview</summary><pre>{preview}</pre></details>{/if}
</div>

<style>
	.editor, fieldset { display: grid; gap: 14px; min-width: 0; }
	fieldset { border: 0; margin: 0; padding: 0; }
	.fields, .toolbar { display: flex; flex-wrap: wrap; gap: 10px; }
	.fields > label { flex: 1; min-width: 110px; }
	.fields > .wide { flex: 2; }
	label { display: grid; gap: 5px; }
	input, select, textarea { width: 100%; min-width: 0; }
	.json-input { font-family: Consolas, monospace; }
	details > label { margin: 10px 0; }
</style>
