<script lang="ts">
  import SettingsPanel from '$lib/components/settings/SettingsPanel.svelte'
  import Button from '$lib/components/ui/Button.svelte'
  import logoUrl from '$lib/resources/logo.svg?url'
  import { settingsSnapshot } from '$lib/settings/settings-store'
  import { consoleSetup } from './consoleSetupStore'
  export let onHide: () => void
  export let onSignOut: () => void
  export let onReturn: (() => void) | null = null
  export let preview = false
  let hasConsoleKey: boolean | null = null
  $: if (hasConsoleKey === null && $settingsSnapshot) hasConsoleKey = Boolean($settingsSnapshot.settings.consoleKey)
</script>

<section class="console-setup-gate" aria-label="Required console setup">
  <header>
    <div class="brand"><img src={logoUrl} alt="" /><strong>SpellBook</strong></div>
    <h1>{preview || $consoleSetup.legacySetup ? `Console setup required after this update` : `${hasConsoleKey ? `Rebind` : `Bind`} your in-game console key`}</h1>
    <p>{hasConsoleKey ? `Rebind and check your in-game console key to continue. You can reuse your existing key.` : `Bind and check your in-game console key to continue.`}</p>
  </header>
  <div class="console-setup-body"><SettingsPanel requiredConsoleSetup initialTab="controls" /></div>
  <footer>
    {#if onReturn}<Button size="sm" label="Back to UX & UI" onClick={onReturn} />{/if}
    <Button size="sm" label="Hide SpellBook to use Chivalry" onClick={onHide} />
    <button class="sign-out" type="button" on:click={onSignOut}>Sign out</button>
  </footer>
</section>

<style lang="scss">
  .console-setup-gate { position: relative; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: var(--gutter-lg); width: min(760px, 100%); max-height: 100%; overflow: hidden; margin: auto; padding: var(--gutter-lg); background: var(--color-dark-primary); border-radius: var(--radius-xl); }
  header { display: grid; gap: var(--gutter-sm); }
  header h1, header p { margin: 0; }
  .brand { display: flex; align-items: center; gap: var(--gutter-md); }
  .brand img { width: 40px; height: 40px; object-fit: contain; }
  .brand strong { font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); }
  .console-setup-body { min-height: 0; overflow: auto; }
  footer { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--gutter-sm); padding-top: var(--gutter-md); border-top: 1px solid var(--color-dark-secondary); }
  .sign-out { padding: var(--gutter-sm); border: 0; background: transparent; color: var(--color-light-tertiary); font-size: var(--font-size-xs); font-weight: var(--font-weight); }
  .sign-out:hover { color: var(--color-light-primary); text-decoration: underline; }
  .sign-out:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 2px; }
  @media (max-width: 600px), (max-height: 760px) {
    .console-setup-gate { padding: var(--gutter-md); gap: var(--gutter-md); }
  }
</style>
