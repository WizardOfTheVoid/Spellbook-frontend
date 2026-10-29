<script lang="ts">
  import { appUpdates } from './appUpdateStore'
  import Icon from '../components/ui/Icon.svelte'
  import { productVersion } from '@spellbook/shared/productVersion'

  $: state = $appUpdates.state
  $: label = state.required ? `Update required` : state.phase === `ready` ? `Update ready` : `Update available`
  $: detail = `${productVersion} to ${state.version}`
</script>

{#if state.version}
  <button class="update-notice" type="button" on:click={appUpdates.open} aria-label={`${label}, ${detail}`}>
    <span class="update-copy">
      <strong>{label}</strong>
      <span class="update-versions">
        <span>{productVersion}</span>
        <span class="update-direction"><Icon name="fa-arrow-right-long" type="regular" size="xs" /></span>
        <span>{state.version}</span>
      </span>
    </span>
  </button>
{:else}
  <slot />
{/if}

<style lang="scss">
  .update-notice {
    display: flex; align-items: center; gap: 9px; min-width: 0; padding: 7px 9px;
    color: #92ffb5; border: 1px solid rgba(105, 247, 150, 0.6); border-radius: 9px;
    background: rgba(39, 157, 87, 0.12); text-align: left; cursor: pointer;
    animation: update-glow 2.4s ease-in-out infinite;
  }
  .update-copy { display: grid; gap: 2px; }
  strong { font-size: 12px; line-height: 1.2; white-space: nowrap; }
  .update-versions { display: flex; align-items: center; gap: 5px; font-size: 10px; line-height: 1.2; color: #afffc8; }
  .update-direction { display: inline-flex; opacity: 0.6; }
  .update-notice:hover, .update-notice:focus-visible { background: rgba(39, 157, 87, 0.25); outline: 2px solid #92ffb5; outline-offset: 3px; }
  @keyframes update-glow {
    0%, 100% { box-shadow: 0 0 5px rgba(73, 237, 126, 0.12), inset 0 0 7px rgba(73, 237, 126, 0.03); text-shadow: 0 0 7px rgba(105, 247, 150, 0.1); }
    50% { box-shadow: 0 0 17px rgba(73, 237, 126, 0.35), inset 0 0 10px rgba(73, 237, 126, 0.08); text-shadow: 0 0 10px rgba(105, 247, 150, 0.45); }
  }
  @media (prefers-reduced-motion: reduce) { .update-notice { animation: none; box-shadow: 0 0 9px rgba(73, 237, 126, 0.25); } }
</style>
