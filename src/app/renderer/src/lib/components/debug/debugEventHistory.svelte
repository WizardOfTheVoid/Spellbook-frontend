<script lang="ts">
	import type { DebugEvent } from '../../../../../shared/debug'
	import { debugJson, debugTime } from './debugEditor'
	export let events: DebugEvent[]
	let filter = ``
	$: query = filter.trim().toLowerCase()
	$: visible = [...events].reverse().filter(event => !query || `${event.actionId ?? ``} ${event.kind} ${event.message}`.toLowerCase().includes(query))
</script>

<section aria-label="Diagnostic event history">
	<h2>Event history</h2>
	<label>Filter by Action ID, event or message<input bind:value={filter} placeholder="All events" /></label>
	<p>{visible.length} of {events.length} retained events · newest first</p>
	<div class="events">
		{#each visible as event}
			<details>
				<summary><time>{debugTime(event.timeMs)}</time><strong>{event.kind}</strong><span>#{event.sequence}</span><p>{event.message}</p></summary>
				<pre>{debugJson(event)}</pre>
			</details>
		{/each}
	</div>
</section>

<style>
	section { display: grid; gap: 10px; min-width: 0; }
	label { display: grid; gap: 5px; }
	.events { max-height: 360px; overflow: auto; }
	details { border-bottom: 1px solid #ffffff1a; padding: 5px 0; }
	time { color: #8995a8; font-family: Consolas, monospace; }
	strong { margin: 0 12px; color: #e8ca76; font-weight: normal; }
	span { color: #8995a8; }
</style>
