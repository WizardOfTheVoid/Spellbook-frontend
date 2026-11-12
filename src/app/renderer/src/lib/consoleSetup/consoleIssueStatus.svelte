<script lang="ts">
  import { onMount } from 'svelte'
  import Icon from '$lib/components/ui/Icon.svelte'
  import { gameProcessAvailable } from '$lib/stores/gameProcessAvailabilityStore'
  import { consoleSetup } from './consoleSetupStore'

  export let onOpenSettings: () => void
  const gameFocused = gameProcessAvailable.focused
  let overlayFocused = true
  let focusReady = false
  let focusRevision = 0
  $: showBinding = focusReady && $gameProcessAvailable && $gameFocused && !overlayFocused
  $: issues = [$consoleSetup.enabled, ...(showBinding ? [$consoleSetup.binding] : [])].filter(check => check.status === `failed` || check.status === `unavailable`)

  onMount(() => {
    const updateFocus = async () => {
      const revision = ++focusRevision
      overlayFocused = document.hasFocus()
      focusReady = false
      if (!overlayFocused) {
        await gameProcessAvailable.refresh()
        if (revision === focusRevision) focusReady = true
      }
    }
    void updateFocus()
    window.addEventListener(`focus`, updateFocus)
    window.addEventListener(`blur`, updateFocus)
    return () => {
      focusRevision++
      window.removeEventListener(`focus`, updateFocus)
      window.removeEventListener(`blur`, updateFocus)
    }
  })
</script>

{#if issues.length}
  <div class="console-issues" role="status" aria-live="polite">
    <button type="button" on:click={onOpenSettings}>
      <Icon name="fa-triangle-exclamation" />
      <span>{#each issues as issue}<span>{issue.message}</span>{/each}</span>
    </button>
  </div>
{/if}

<style lang="scss">
  .console-issues { position: fixed; top: var(--gutter-lg); left: calc(var(--nav-width, 112px) + 2 * var(--gutter-lg)); z-index: 34; max-width: min(340px, 30vw); }
  button { display: flex; align-items: center; gap: var(--gutter-sm); padding: var(--gutter-sm) var(--gutter-md); border: 1px solid var(--color-accent-tertiary); border-radius: var(--radius); background: var(--color-dark-primary); color: var(--color-light-primary); text-align: left; font-size: var(--font-size-xs); }
  button > span { display: grid; gap: var(--gutter-sm); }
</style>
