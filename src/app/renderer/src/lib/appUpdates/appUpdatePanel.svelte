<script lang="ts">
  import { onMount } from 'svelte'
  import ConfirmModal from '../components/ui/ConfirmModal.svelte'
  import ProgressBar from '../components/ui/progressBar.svelte'
  import logoUrl from '../resources/logo.svg?url'
  import { productVersion } from '@spellbook/shared/productVersion'
  import { appUpdates } from './appUpdateStore'
  import AppUpdateNotice from './appUpdateNotice.svelte'

  export let showFallbackNotice = false

  onMount(() => appUpdates.connect())
  $: state = $appUpdates.state
  $: busy = state.phase === `installing` || $appUpdates.pending
  $: message = state.error ?? (state.phase === `ready` ? (state.required ? `This update is required to keep using SpellBook.` : `Your update is ready. Restart when it suits you, or it will update on the next startup.`)
    : state.phase === `downloading` ? (state.required ? `A required update is downloading. Please wait.` : `Your update is downloading. You can keep using SpellBook.`)
    : state.phase === `checking` ? `Checking for an update...`
    : state.phase === `installing` ? `Restarting SpellBook. Please wait...` : `You have the latest version of SpellBook.`)
</script>

{#if showFallbackNotice && state.version && !$appUpdates.open}
  <header class="update-header"><AppUpdateNotice /></header>
{/if}

{#if $appUpdates.open && !$appUpdates.confirming}
  <ConfirmModal
    title="SpellBook update"
    {message}
    icon="fa-arrow-down-to-bracket"
    iconType="light"
    confirmTone="primary"
    confirmLabel={state.restartRequired ? `Restart SpellBook` : `Restart and update`}
    busyLabel="Restarting..."
    busy={busy || (state.restartRequired && state.phase !== `error`)}
    showConfirm={state.phase === `ready` || state.restartRequired}
    cancelLabel={state.restartRequired ? `Please wait` : state.required ? `Update required` : `Later`}
    cancelDisabled={state.restartRequired || state.required}
    confirmDisabled={state.restartRequired ? state.phase !== `error` : state.phase !== `ready`}
    manageOverlayState={true}
    onConfirm={() => void (state.restartRequired ? appUpdates.restart() : appUpdates.install())}
    onCancel={appUpdates.close}
  >
    <div class="update-version">
      <img src={logoUrl} alt="" />
      <span>SpellBook {productVersion}{state.version ? ` → ${state.version}` : ``}</span>
    </div>
    {#if state.phase === `downloading` || state.phase === `checking`}
      <ProgressBar value={state.percent} label="Update download" />
      {#if state.percent !== null}<p aria-live="polite">{Math.floor(state.percent)}%</p>{/if}
    {/if}
    {#if state.phase === `error` || state.phase === `idle`}
      <div class="update-options">
        {#if !state.restartRequired}<button type="button" on:click={() => void appUpdates.retry()}>Retry</button>{/if}
        <button type="button" on:click={() => void appUpdates.openDownload()}>Open download page</button>
      </div>
    {/if}
  </ConfirmModal>
{/if}

<style lang="scss">
  .update-header { position: fixed; left: var(--gutter-lg); top: var(--gutter-lg); z-index: 34; }
  .update-version { display: flex; align-items: center; gap: var(--gutter-md); color: var(--color-light-secondary); }
  .update-version img { width: 40px; height: 40px; }
  .update-options { display: flex; flex-wrap: wrap; gap: var(--gutter-sm); }
  .update-options button { padding: var(--gutter-sm); }
  p { margin: 0; text-align: right; }
</style>
