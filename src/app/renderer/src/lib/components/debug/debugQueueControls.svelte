<script lang="ts">
	import type { DebugControlApi, DebugSessionSnapshot, DebugQueueOperation } from '../../../../../shared/debug'
	import { commandSummary, debugJson, debugSeconds } from './debugEditor'

	export let api: DebugControlApi
	export let state: DebugSessionSnapshot
	let selectedId = ``
	let error = ``
	$: actions = state.core?.queue.actions ?? []
	$: selected = actions.find(action => action.id === selectedId)

	async function operate(operation: DebugQueueOperation, id?: string): Promise<void> {
		error = ``
		try { await api.queue(operation, id) }
		catch (reason) { error = reason instanceof Error ? reason.message : String(reason) }
	}
</script>

<div class="queue-controls">
	<p>Full Core queue · {state.core?.queue.paused ? `manually paused` : `running`} · {actions.length} Actions. Pause and step take effect between Commands. TTL keeps counting.</p>
	<div class="toolbar">
		<button type="button" disabled={!state.core} on:click={() => operate(state.core?.queue.paused ? `resume` : `pause`)}>{state.core?.queue.paused ? `Resume full queue` : `Pause full queue`}</button>
		<button type="button" disabled={!state.core} on:click={() => operate(`step`)}>Step one command</button>
		<button type="button" disabled={!selected} on:click={() => operate(`cancel`, selectedId)}>Cancel selected Action</button>
		<button type="button" class="danger" disabled={!state.core} on:click={() => operate(`stop`)}>Stop full queue</button>
	</div>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	{#if !state.core}<p>Core diagnostics unavailable.</p>{:else if !actions.length}<p>The queue is empty.</p>{/if}
	{#each actions as action}
		<article class:selected={selectedId === action.id}>
			<label class="selection"><input type="radio" name="debug-queue-action" value={action.id} bind:group={selectedId} /><strong>{action.author} / {action.priority}</strong><span>{action.state} · {action.cursor}/{action.commandCount} sent · TTL {debugSeconds(action.remainingMs)}</span></label>
			<code>{action.id}</code>
			{#if action.reason}<p class="error">{action.reason}</p>{/if}
			<ol>{#each action.commands as command, index}<li class:sent={index < action.cursor} class:current={index === action.cursor}>{commandSummary(command)}</li>{/each}</ol>
			<details><summary>Complete Action diagnostics</summary><pre>{debugJson(action)}</pre></details>
		</article>
	{/each}
</div>

<style>
	.queue-controls { display: grid; gap: 14px; }
	.toolbar, .selection { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
	article { min-width: 0; padding: 12px; border: 1px solid #ffffff26; border-radius: 8px; }
	article.selected { border-color: #e8ca76; }
	.selection { cursor: pointer; margin-bottom: 8px; }
	.selection span { margin-left: auto; color: #aab5c5; }
	code { overflow-wrap: anywhere; color: #aab5c5; }
	li { padding: 4px 0; overflow-wrap: anywhere; }
	.sent { color: #8793a5; }
	.current { color: #e8ca76; }
</style>
