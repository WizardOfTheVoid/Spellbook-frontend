<script lang="ts">
  import type { Snippet } from 'svelte'

  export let children: Snippet
  let revealed = false
</script>

<span class="spoiler" class:revealed>
  <span class:hidden={!revealed} aria-hidden={!revealed} inert={!revealed}>{@render children()}</span>
  {#if !revealed}<button type="button" aria-label="Reveal spoiler" on:click={() => revealed = true}></button>{/if}
</span>

<style lang="scss">
  .spoiler { position: relative; display: inline-block; max-width: 100%; vertical-align: baseline; border-radius: 0.2em; padding: 0.08em 0.2em; }
  .revealed { background: rgbaa(var(--color-light-primary), 0.1); }
  .hidden { visibility: hidden; user-select: none; }
  button {
    position: absolute;
    inset: 0;
    width: 100%;
    border: 0;
    border-radius: inherit;
    padding: 0;
    background: var(--color-dark-secondary);
    cursor: pointer;
  }
  button:hover { background: var(--color-light-tertiary); }
  button:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
</style>
