<script lang="ts">
	import { onMount } from 'svelte'
	import type { DebugSessionSnapshot } from '../../../../shared/debug'
	import type { GameActivitySnapshot } from '../../../../shared/gameActivity'
	import { createDebugLayout } from '../../../../shared/debugPresets'
	import DebugHudPanel from '$lib/components/debug/debugHudPanel.svelte'
	import DebugStatePanel from '$lib/components/debug/debugStatePanel.svelte'
	import { commandSummary, debugSeconds, debugTime } from '$lib/components/debug/debugEditor'

	let state: DebugSessionSnapshot | null = null
	let activity: GameActivitySnapshot | null = null
	let error = ``
	const defaults = createDebugLayout()
	$: layout = state?.layout ?? defaults
	$: core = state?.core ?? null
	$: selected = state?.presets.find(preset => preset.slot === state?.selectedSlot)
	$: recentRuns = state?.runs.slice(-1) ?? []
	$: events = state?.events.slice(-5).reverse() ?? []
	$: actions = core?.queue.actions ?? []

	onMount(() => {
		let disposed = false
		let received = false
		const stopState = window.chivDebug?.onState(value => {
			received = true
			state = value
			if (!value.core) activity = null
		})
		const stopActivity = window.chivDebug?.onActivity(value => { activity = value })
		async function initialize(): Promise<void> {
			try {
				const initial = await window.chivDebug?.getState()
				if (!disposed && !received && initial) state = initial
			} catch (reason) { if (!disposed) error = reason instanceof Error ? reason.message : String(reason) }
		}
		void initialize()
		return () => {
			disposed = true
			stopState?.()
			stopActivity?.()
		}
	})
</script>

<div class="debug-hud debug-status" class:hud-hidden={!state?.enabled || state?.hudVisible === false} aria-label="Debug game panels">
	<DebugHudPanel name="tests" title="TESTS" status={state?.armed ? `NUMPAD ARMED` : `DISARMED`} layout={layout.tests}>
		<div class="test-slots">
			{#each state?.presets ?? [] as preset}<div class:chosen={preset.slot === state?.selectedSlot}><b>{preset.slot}</b><span>{preset.label}</span><small>{preset.priority}</small></div>{/each}
		</div>
		<p class="muted">F5 Debug · F6 HUD</p>
		{#if selected}<p class="instructions">{selected.instruction}</p><p class="muted">{selected.repeat}× · every {debugSeconds(selected.intervalMs)} · start {debugSeconds(selected.startDelayMs)} · {selected.identity}</p>{/if}
		{#each state?.scheduled ?? [] as pending}<p class="active">Slot {pending.slot}: {pending.remaining === `infinite` ? `LOOP ON · press ${pending.slot} to stop` : `${pending.remaining} remaining`} · next in {debugSeconds(Math.max(0, pending.nextRunAt - Date.now()))}</p>{/each}
		<div class="section-line"><span>{state?.recording ? `● RECORDING` : `Recording off`}</span><span>{core ? `Core live` : `Core unavailable`}</span></div>
		<p class="muted">Producers paused: {state ? Object.entries(state.pausedProducers).filter(([, paused]) => paused).map(([name]) => name).join(`, `) || `none` : `—`}</p>
		{#each recentRuns as run}<p class="run-result"><span>{run.slot} · {run.label}</span><strong>{run.state}</strong></p>{/each}
		{#if state?.error || error}<p class="error">{state?.error || error}</p>{/if}
	</DebugHudPanel>

	<DebugHudPanel name="queue" title="ACTION QUEUE" status={core ? `${actions.length} · ${core.queue.paused ? `MANUAL PAUSE` : core.status.queue.state}` : `UNAVAILABLE`} layout={layout.queue}>
		<dl><dt>Phase</dt><dd>{core?.execution.phase ?? `—`}</dd><dt>Active cursor</dt><dd>{core ? `${core.status.queue.cursor}/${core.status.queue.commandCount}` : `—`}</dd><dt>Active TTL</dt><dd>{debugSeconds(core?.status.queue.remainingMs)}</dd><dt>Reason</dt><dd>{core?.status.queue.reason ?? `—`}</dd></dl>
		<div class="queue-items">
			{#each actions.slice(0, 1) as action}
				<div class="queue-item"><div class="section-line"><strong>{action.author} / {action.priority}</strong><span>{action.state} · {action.cursor}/{action.commandCount}</span></div><p class="identifier">{action.id}</p><p class="muted">TTL {debugSeconds(action.remainingMs)}{action.reason ? ` · ${action.reason}` : ``}</p>
					{#each action.commands.slice(action.cursor, action.cursor + 2) as command, offset}<p class="queue-command identifier" class:active={offset === 0}>{action.cursor + offset + 1}. {commandSummary(command)}{offset === 0 && action.keyCursor ? ` · ${action.keyCursor} keys sent` : ``}</p>{/each}
				</div>
			{/each}
			{#if actions.length > 1}<p class="muted">+ {actions.length - 1} Actions · full queue in controls</p>{/if}
			{#if core && !actions.length}<p class="muted">Queue empty</p>{/if}
		</div>
		<div class="last-result"><h3>Last result</h3><p class="identifier">{core?.status.queue.lastResult?.id ?? `—`}</p><p>{core?.status.queue.lastResult?.status ?? `—`} · {core?.status.queue.lastResult?.sentCommands ?? 0} sent{core?.status.queue.lastResult?.errorCode ? ` · ${core.status.queue.lastResult.errorCode}` : ``}</p></div>
	</DebugHudPanel>

	<DebugHudPanel name="state" title="LIVE STATE" status={core ? `PHYSICAL / INJECTED` : `UNAVAILABLE`} layout={layout.state}><DebugStatePanel {core} {activity} appCpuPercent={state?.appCpuPercent ?? null} /></DebugHudPanel>

	<DebugHudPanel name="events" title="EVENT HISTORY" status={core ? `SEQ ${core.sequence}` : `OFFLINE`} layout={layout.events}>
		{#if core?.eventsLost}<p class="error">Event journal gap detected.</p>{/if}
		{#if !events.length}<p class="muted">Waiting for diagnostic events…</p>{/if}
		{#each events as event}
			<div class="event"><div class="event-meta"><time>{debugTime(event.timeMs)}</time><strong>{event.kind}</strong><span>#{event.sequence}{event.commandIndex === undefined || event.commandIndex === null ? `` : ` · C${event.commandIndex + 1}`}</span></div><p class="identifier">{event.message}</p></div>
		{/each}
		<p class="muted">{state?.events.length ?? 0} retained · full history in controls</p>
	</DebugHudPanel>
</div>

<style>
	:global(html), :global(body) { margin: 0; width: 100%; height: 100%; background: transparent; overflow: hidden; }
	.debug-hud { position: fixed; inset: 0; pointer-events: none; user-select: none; opacity: 1; transition: opacity 650ms var(--easing); }
	.debug-hud.hud-hidden { opacity: 0; }
	.debug-hud :global(p) { margin: 4px 0 0; overflow-wrap: anywhere; }
	.debug-hud :global(.muted) { color: #8995a8; }
	.debug-hud :global(.error) { color: #efa89e; }
	.debug-hud :global(.active) { color: #e8ca76; }
	.test-slots { display: grid; gap: 3px; }
	.test-slots > div { display: flex; gap: 8px; align-items: baseline; padding: 2px 4px; border-radius: 3px; }
	.test-slots b { color: #e8ca76; min-width: 12px; }
	.test-slots span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
	.test-slots small { margin-left: auto; color: #8995a8; font-size: 10px; }
	.test-slots .chosen { background: #e8ca761a; }
	.instructions { color: #c3cddd; padding-top: 6px; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
	.section-line, .run-result { display: flex; justify-content: space-between; gap: 8px; }
	.section-line { margin-top: 7px; }
	.run-result strong { font-weight: normal; color: #e8ca76; }
	dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 2px 10px; margin: 0; }
	dt { color: #aab5c5; }
	dd { margin: 0; text-align: right; overflow-wrap: anywhere; }
	.identifier { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.queue-items { margin-top: 8px; }
	.queue-item { padding: 6px 0; border-top: 1px solid #ffffff1a; }
	.queue-item .section-line { margin: 0; }
	.queue-item strong { font-weight: normal; }
	.queue-command { font-size: 10px; }
	.last-result { border-top: 1px solid #ffffff1a; padding-top: 7px; margin-top: 7px; }
	h3 { font-size: 10px; font-weight: normal; margin: 0 0 4px; color: #8995a8; }
	.event { padding: 6px 0; border-bottom: 1px solid #ffffff12; }
	.event:first-child { padding-top: 0; }
	.event-meta { display: flex; gap: 9px; align-items: baseline; }
	.event-meta time, .event-meta span { color: #8995a8; font-size: 10px; }
	.event-meta strong { color: #e8ca76; font-weight: normal; }
	.event-meta span { margin-left: auto; }
</style>
