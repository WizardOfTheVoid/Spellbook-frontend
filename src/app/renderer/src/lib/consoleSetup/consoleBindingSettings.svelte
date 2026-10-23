<script lang="ts">
  import KeybindSetting from '$lib/components/settings/KeybindSetting.svelte'
  import Select from '$lib/components/ui/Select.svelte'
  import Button from '$lib/components/ui/Button.svelte'
  import ConsoleSetupTiles from './consoleSetupTiles.svelte'
  import { consoleSetup } from './consoleSetupStore'
  import { gameProcessAvailable } from '$lib/stores/gameProcessAvailabilityStore'
  import { settingsSnapshot } from '$lib/settings/settings-store'

  export let hidden = false
  export let disabled = false
  let keyBusy = false
  let savingLayout = false
  let saveError = ``
  $: checking = $consoleSetup.binding.status === `checking`
  $: busy = disabled || checking || savingLayout
  $: options = $consoleSetup.layouts.map(layout => ({ value: layout.id, label: layout.displayName }))

  async function selectLayout(layoutId: string) {
    savingLayout = true
    saveError = await consoleSetup.setLayout(layoutId) ? `` : `Could not save the keyboard layout. Try again.`
    savingLayout = false
  }
</script>

<div class="console-binding-group" {hidden}>
  <KeybindSetting compact name="consoleKey" {hidden} disabled={busy} bind:busy={keyBusy} />
  <div class="console-binding-layout">
    <div class="console-binding-copy">
      <strong>Layout SpellBook uses</strong>
      {#if $consoleSetup.selectedLayout}<small aria-live="polite">{$consoleSetup.selectedLayout.source === `manual` ? `Manual selection` : `Detected by keybind check`}</small>{/if}
    </div>
    <Select
      label="Layout SpellBook uses"
      showLabel={false}
      value={$consoleSetup.selectedLayout?.layoutId ?? ``}
      {options}
      placeholder="Check keybind to detect"
      disabled={busy || keyBusy || $consoleSetup.setupRequired || $consoleSetup.layoutCatalogStatus !== `ready`}
      error={saveError || null}
      onChange={value => void selectLayout(value)}
    />
  </div>
  <small class="console-binding-hint">SpellBook temporarily uses this layout for console input, then switches back.</small>
{#if $consoleSetup.setupReason === `layoutUnavailable`}<p role="alert">Keyboard layout unavailable. Record and check your console key using a layout configured in Windows.</p>{/if}
{#if $consoleSetup.setupReason === `coreUpgradeRequired`}<p role="alert">Update SpellBook Core to configure keyboard layouts.</p>{/if}
{#if $consoleSetup.layoutCatalogStatus !== `ready` || $consoleSetup.setupReason === `storageUnavailable`}
  <p role="alert">{$consoleSetup.binding.status === `unavailable` ? $consoleSetup.binding.message : `Keyboard layouts are unavailable. Check Core and retry.`}</p>
  <Button size="sm" label="Retry keyboard layouts" disabled={busy || keyBusy} onClick={() => void consoleSetup.run(`refreshKeyboardLayouts`)} />
{/if}
{#if $consoleSetup.restorationFault}
  <p role="alert">{$consoleSetup.restorationFault}</p>
  <Button size="sm" label="Retry layout restoration" disabled={busy || keyBusy} onClick={() => void consoleSetup.run(`retryKeyboardLayoutRestore`)} />
{/if}
{#if $consoleSetup.recordRequired}<p>{$settingsSnapshot?.settings.consoleKey ? `Rebind your in-game console key above. You can reuse your existing key.` : `Bind your in-game console key above.`}</p>{/if}
{#if !$gameProcessAvailable}<p>Start Chivalry 2 to finish setup.</p>{/if}
{#if $consoleSetup.enabled.status === `failed`}<Button size="sm" label="Enable in-game console" disabled={busy || keyBusy} onClick={() => void consoleSetup.run(`enableConsole`)} />{/if}
<ConsoleSetupTiles {hidden} disabled={busy || keyBusy} />
</div>

<style lang="scss">
  .console-binding-group {
    display: grid;
    gap: var(--gutter-md);
    min-width: 0;
    border: 1px solid var(--color-dark-secondary);
    border-radius: var(--radius-xl);
    padding: var(--gutter-md);
    background: var(--color-dark-primary);
    container-type: inline-size;
  }
  .console-binding-group[hidden] { display: none; }
  .console-binding-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(160px, 240px); align-items: center; gap: var(--gutter-md); }
  .console-binding-copy { display: grid; gap: 4px; }
  strong { font-size: var(--font-size-md); font-weight: var(--font-weight-medium); }
  small { font-size: var(--font-size-xs); color: var(--color-light-tertiary); }
  .console-binding-hint { font-weight: var(--font-weight); }
  p { margin: 0; font-size: var(--font-size-xs); }
  @container (max-width: 380px) {
    .console-binding-layout { grid-template-columns: minmax(0, 1fr); gap: var(--gutter-sm); }
  }
</style>
