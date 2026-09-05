<script lang="ts">
  import { onMount } from 'svelte'
  import IconBadge from '$lib/components/ui/IconBadge.svelte'
  import { loadSettings, settingsSnapshot, updateSettings } from '$lib/settings/settings-store'
  import { consoleKeyLabel, recordedConsoleKey, type ConsoleKeyCode } from '../../../../../shared/consoleKey'

  export let disabled = false
  export let hidden = false

  let recording = false
  let saving = false
  let message = ``

  $: key = $settingsSnapshot?.settings.consoleKey ?? null
  $: if (disabled || hidden) recording = false

  onMount(() => {
    if (!$settingsSnapshot) void loadSettings()
  })

  async function save(consoleKey: ConsoleKeyCode | null): Promise<void> {
    recording = false
    saving = true
    const snapshot = await updateSettings({ consoleKey })
    saving = false
    message = snapshot ? `Console key saved on this computer.` : `Could not save the console key. Try again.`
  }

  function toggleRecording(): void {
    recording = !recording
    message = ``
  }

  function capture(event: KeyboardEvent): void {
    if (!recording || disabled || hidden) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.code === `Escape`) {
      recording = false
      message = ``
      return
    }
    const code = recordedConsoleKey(event)
    if (!code) {
      message = `Use one key without modifiers. Enter, Escape, F3, F4 and F12 are reserved.`
      return
    }
    void save(code)
  }
</script>

<svelte:window on:keydown|capture={capture} on:blur={() => recording = false} />

<div class="console-bind" {hidden}>
  <IconBadge name="fa-keyboard" tone="accent" />
  <div class="console-bind__copy">
    <strong>Console key</strong>
    <small>Use the same key bound to the console in Chivalry 2. Saved on this computer.</small>
  </div>
  <div class="console-bind__controls">
    <button
      type="button"
      class:recording
      aria-label={recording ? `Press your console key; Escape cancels` : `Record console key: ${consoleKeyLabel(key)}`}
      aria-pressed={recording}
      disabled={disabled || saving || !$settingsSnapshot}
      on:blur={() => recording = false}
      on:click={toggleRecording}
    >{saving ? `Saving…` : recording ? `Press a key…` : consoleKeyLabel(key)}</button>
    <button type="button" disabled={disabled || saving || key === null} on:click={() => save(null)}>Reset</button>
  </div>
  <small class="console-bind__hint" aria-live="polite">
    {message || (recording ? `Press one physical key. Escape cancels. F3, F4 and F12 are reserved.` : `Click the key to record a replacement. This does not change the game’s key bindings.`)}
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
