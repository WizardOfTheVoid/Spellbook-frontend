<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import IconBadge from '$lib/components/ui/IconBadge.svelte'
  import { loadSettings, settingsSnapshot, updateSettings } from '$lib/settings/settings-store'
  import { consoleKeyLabel, recordedConsoleKey } from '../../../../../shared/consoleKey'
  import { ConsoleBindController, type ConsoleBindState } from './consoleBindController'

  export let disabled = false
  export let hidden = false
  export let busy = false

  let state: ConsoleBindState
  const controller = new ConsoleBindController({
    load: async () => Boolean(await loadSettings()),
    save: async consoleKey => Boolean(await updateSettings({ consoleKey }))
  }, next => state = next)
  state = controller.state

  $: key = $settingsSnapshot?.settings.consoleKey ?? null
  $: busy = state.busy
  $: if (disabled || hidden) controller.cancelRecording()

  onMount(() => {
    if (!$settingsSnapshot) void controller.load()
  })
  onDestroy(() => controller.destroy())

  function toggleRecording(): void {
    if (state.recording) controller.cancelRecording(true)
    else controller.startRecording()
  }

  function capture(event: KeyboardEvent): void {
    if (!state.recording || disabled || hidden) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.code === `Escape`) {
      controller.cancelRecording(true)
      return
    }
    const code = recordedConsoleKey(event)
    if (!code) {
      controller.rejectKey()
      return
    }
    void controller.save(code)
  }
</script>

<svelte:window on:keydown|capture={capture} on:blur={() => controller.cancelRecording()} />

<div class="console-bind" {hidden}>
  <IconBadge name="fa-keyboard" tone="accent" />
  <div class="console-bind__copy">
    <strong>Console key</strong>
    <small>Use the same key bound to the console in Chivalry 2. Saved on this computer.</small>
  </div>
  <div class="console-bind__controls">
    <button
      type="button"
      class:recording={state.recording}
      aria-label={state.recording ? `Press your console key; Escape cancels` : `Record console key: ${consoleKeyLabel(key)}`}
      aria-pressed={state.recording}
      disabled={disabled || state.loading || state.saving || !$settingsSnapshot}
      on:blur={() => controller.cancelRecording()}
      on:click={toggleRecording}
    >{state.loading ? `Loading...` : state.saving ? `Saving...` : state.recording ? `Press a key...` : consoleKeyLabel(key)}</button>
    <button type="button" disabled={disabled || state.busy || !$settingsSnapshot || key === null} on:click={() => void controller.save(null)}>Reset</button>
    {#if state.retry}
      <button type="button" disabled={disabled || state.busy} on:click={() => void controller.retry()}>Retry</button>
    {/if}
  </div>
  <small class="console-bind__hint" aria-live="polite">
    {state.message || (state.recording ? `Press one physical key. Escape cancels. F3, F4 and F12 are reserved.` : `Click the key to record a replacement. This does not change the game's key bindings.`)}
  </small>
</div>

<style lang="scss">
  .console-bind {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: var(--gutter-md);
    border: 1px solid var(--color-dark-secondary);
    border-radius: var(--radius-xl);
    padding: var(--gutter-md);
    background: var(--color-dark-primary);
  }

  .console-bind[hidden] { display: none; }
  .console-bind__copy { display: grid; gap: var(--gutter-sm); }
  strong { font-size: var(--font-size-md); font-weight: var(--font-weight-medium); }
  small { color: var(--color-text-secondary); font-size: var(--font-size-xs); }
  .console-bind__controls { grid-column: 1 / -1; display: flex; gap: var(--gutter-sm); }
  .console-bind__controls button {
    min-height: var(--control-height-md);
    padding: 0 var(--gutter-md);
    border-radius: var(--radius);
    border: 1px solid var(--color-dark-secondary);
    font-size: var(--font-size-xs);
  }
  .console-bind__controls button:first-child { flex: 1; }
  .console-bind__controls .recording { border-color: var(--color-accent-primary); }
  .console-bind__hint { grid-column: 1 / -1; }
</style>
