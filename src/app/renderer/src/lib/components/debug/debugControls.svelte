<script lang="ts">
	import { onMount } from 'svelte'
	import type { DebugControlApi, DebugSessionSnapshot } from '../../../../../shared/debug'
	import { getOverlayApi } from '$lib/core'
	import { containModalTab, ModalStateCoordinator, mountModalEnvironment } from '$lib/utils/quickActionUi'
	import DebugPresetEditor from './debugPresetEditor.svelte'
	import DebugQueueControls from './debugQueueControls.svelte'
	import DebugEnvironmentControls from './debugEnvironmentControls.svelte'
	import DebugLayoutControls from './debugLayoutControls.svelte'
	import DebugEventHistory from './debugEventHistory.svelte'
	import { debugJson } from './debugEditor'

	export let onClose: () => void
	let api: DebugControlApi | undefined
	let state: DebugSessionSnapshot | null = null
	let error = ``
	let notice = ``
	let busy = false
	let tab = `Tests`
	let slot = 1
	let editorVersion = 0
	let marker = ``
	let modalRoot: HTMLDivElement
	let dialog: HTMLDivElement
	let closeButton: HTMLButtonElement
	const tabs = [`Tests`, `Queue`, `Timing & producers`, `Layout`, `Runs & recording`]
	const modalState = new ModalStateCoordinator(open => getOverlayApi().setModalOpen(open))
	$: selectedPreset = state?.presets.find(preset => preset.slot === slot)

	async function perform(action: () => Promise<unknown>): Promise<void> {
		busy = true
		error = ``
		notice = ``
		try { await action() }
		catch (reason) { error = reason instanceof Error ? reason.message : String(reason) }
		finally { busy = false }
	}

	onMount(() => {
		api = window.chivDebug
		let disposed = false
		let received = false
		const cleanup = mountModalEnvironment(modalRoot, document.activeElement instanceof HTMLButtonElement ? document.activeElement : null)
		const unsubscribe = api?.onState(value => {
			received = true
			state = value
		})
		const stopVisibility = getOverlayApi().onVisibilityChange(visible => { if (!visible) onClose() })
		async function initialize(): Promise<void> {
			try {
				await modalState.set(true)
				const initial = await api?.getState()
				if (!disposed && !received && initial) state = initial
			} catch (reason) { if (!disposed) error = reason instanceof Error ? reason.message : String(reason) }
		}
		void initialize()
		const onKeydown = (event: KeyboardEvent): void => {
			if (event.key === `Escape`) {
				event.stopPropagation()
				onClose()
			}
			containModalTab(event, dialog, document.activeElement)
		}
		window.addEventListener(`keydown`, onKeydown)
		closeButton.focus()
		return () => {
			disposed = true
			unsubscribe?.()
			stopVisibility()
			window.removeEventListener(`keydown`, onKeydown)
			void modalState.set(false).catch(() => undefined)
			cleanup()
		}
	})
</script>

<div class="debug-controls" bind:this={modalRoot}>
	<button class="backdrop" type="button" aria-label="Close debug controls" tabindex="-1" on:click={onClose}></button>
	<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="debug-controls-title" tabindex="-1" bind:this={dialog}>
		<header><div><h1 id="debug-controls-title">Debug test controls</h1><p>{state?.enabled ? `Debug enabled` : `Enable Debug in Settings to run tests`} · {state?.core ? `Core connected` : `Core unavailable`}</p></div><button type="button" bind:this={closeButton} on:click={onClose}>Close</button></header>
		{#if api && state}
			<div class="session-toolbar">
				<span>{state.armed ? `Numpad 1–4 armed` : state.enabled ? `Waiting for Core` : `Tests disabled`}</span>
				<span class:recording={state.recording}>{state.recording ? `● Recording` : `Recording off`}</span>
				<button type="button" class="danger" disabled={!state.enabled} on:click={() => perform(() => api!.stop())}>Stop tests</button>
			</div>
			<nav aria-label="Debug controls sections">{#each tabs as name}<button type="button" class:active={tab === name} aria-pressed={tab === name} on:click={() => tab = name}>{name}</button>{/each}</nav>
			<div class="content">
				{#if error || state.error}<p class="error" role="alert">{error || state.error}</p>{/if}
				{#if notice}<p role="status">{notice}</p>{/if}
				{#if tab === `Tests`}
					<p>Tests arm automatically with Debug. Each physical press fires once while game-focused. Release the trigger to let normal input gates settle. Press a loop key again to stop it. F5 toggles Debug; F6 fades the HUD.</p>
					<div class="presets">{#each state.presets as preset}<button type="button" class:active={slot === preset.slot} on:click={() => slot = preset.slot}><b>{preset.slot}</b><span>{preset.label}</span></button>{/each}</div>
					{#if selectedPreset}{#key `${slot}-${editorVersion}`}<DebugPresetEditor {api} preset={selectedPreset} enabled={state.enabled && Boolean(state.core)} running={state.scheduled?.some(run => run.slot === slot && run.remaining === `infinite`) ?? false} />{/key}{/if}
					<button type="button" disabled={busy} on:click={() => perform(async () => {
						await api!.resetPresets()
						state = await api!.getState()
						editorVersion += 1
					})}>Restore default presets</button>
				{:else if tab === `Queue`}<DebugQueueControls {api} {state} />
				{:else if tab === `Timing & producers`}<DebugEnvironmentControls {api} {state} />
				{:else if tab === `Layout`}<DebugLayoutControls {api} layout={state.layout} />
				{:else}
					<div class="toolbar">
						<button type="button" disabled={busy} on:click={() => perform(() => api!.record(!state!.recording))}>{state.recording ? `Stop recording` : `Start recording`}</button>
						<button type="button" disabled={busy} on:click={() => perform(async () => {
							const path = await api!.exportRecording()
							notice = path ? `Recording saved: ${path}` : `Export cancelled.`
						})}>Export recording</button>
					</div>
					<div class="marker"><label>Recording marker<input bind:value={marker} maxlength="200" placeholder="What changed?" /></label><button type="button" disabled={!state.recording || !marker.trim() || busy} on:click={() => perform(async () => {
						await api!.mark(marker.trim())
						marker = ``
					})}>Add marker</button></div>
					<p>Results report submitted progress; they do not confirm the game accepted a command.</p>
					<DebugEventHistory events={state.events} />
					<details><summary>Full live Core snapshot</summary><pre>{debugJson(state.core)}</pre></details>
					{#if !state.runs.length}<p>No test runs yet.</p>{/if}
					{#each [...state.runs].reverse() as run}<details class="run"><summary><strong>{run.slot} · {run.label}</strong> <span>{run.state} · {new Date(run.startedAt).toLocaleTimeString()}</span></summary><p><code>{run.id}</code></p><h2>Request</h2><pre>{debugJson(run.request)}</pre><h2>Result</h2><pre>{debugJson(run.result)}</pre></details>{/each}
				{/if}
			</div>
		{:else}<div class="content"><p role="status">{error || (api ? `Loading debug session…` : `Debug controls are unavailable in this window.`)}</p></div>{/if}
	</div>
</div>

<style>
	.debug-controls { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; padding: 24px; color: #d6dde8; font-size: 13px; }
	.backdrop { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; border-radius: 0; background: #02080dc9; }
	.dialog { position: relative; display: flex; flex-direction: column; width: min(980px, 100%); max-height: 92vh; min-height: 420px; border: 1px solid #ffffff30; border-radius: 12px; background: #090f19; box-shadow: 0 20px 80px #0008; overflow: hidden; }
	header { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 18px 20px; }
	h1 { margin: 0 0 6px; font-size: 20px; color: #e8ca76; }
	.debug-controls :global(p) { margin: 0; line-height: 1.5; overflow-wrap: anywhere; }
	header p { color: #8995a8; }
	.session-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; padding: 12px 20px; background: #ffffff06; }
	.session-toolbar > button { margin-left: auto; }
	.recording { color: #e49c94; }
	nav { display: flex; gap: 6px; padding: 12px 20px; border-bottom: 1px solid #ffffff1a; overflow-x: auto; flex-shrink: 0; }
	nav button { white-space: nowrap; }
	.content { display: grid; gap: 16px; padding: 20px; min-height: 0; overflow: auto; align-content: start; }
	.debug-controls :global(button) { min-height: 32px; padding: 6px 11px; border: 1px solid #ffffff26; border-radius: 6px; background: #141d2c; color: #d6dde8; cursor: pointer; font: inherit; }
	.debug-controls :global(button:disabled) { opacity: .45; cursor: default; }
	.debug-controls :global(button.active), .debug-controls :global(button.accent) { border-color: #e8ca7677; background: #e8ca7612; color: #e8ca76; }
	.debug-controls :global(button.danger) { border-color: #c9776a66; color: #f0aca1; }
	.debug-controls :global(input:not([type=checkbox]):not([type=radio])), .debug-controls :global(select), .debug-controls :global(textarea) { box-sizing: border-box; padding: 7px 9px; min-height: 32px; border: 1px solid #ffffff26; border-radius: 5px; background: #050b13; color: #d6dde8; font: inherit; }
	.debug-controls :global(input[type=checkbox]), .debug-controls :global(input[type=radio]) { accent-color: #e8ca76; }
	.debug-controls :global(textarea) { resize: vertical; }
	.debug-controls :global(pre) { max-height: 340px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; padding: 12px; border-radius: 6px; background: #02070d; color: #bac7dc; font: 12px/1.5 Consolas, monospace; }
	.debug-controls :global(summary) { cursor: pointer; padding: 6px 0; }
	.debug-controls :global(.error) { color: #f0aca1; }
	.debug-controls :global(h2) { font-size: 14px; margin: 10px 0 4px; }
	.presets { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
	.presets button { display: flex; align-items: center; gap: 10px; text-align: left; }
	.presets b { color: #e8ca76; font: bold 18px Consolas, monospace; }
	.toolbar, .marker { display: flex; align-items: end; flex-wrap: wrap; gap: 10px; }
	.marker label { flex: 1; display: grid; gap: 5px; }
	.run { border: 1px solid #ffffff26; border-radius: 8px; padding: 8px 12px; min-width: 0; }
	.run summary span { color: #aab5c5; margin-left: 10px; }
	@media (max-width: 640px) { .debug-controls { padding: 10px; } .presets { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
