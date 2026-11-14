<script lang="ts">
  import type { EvidenceDuplicate } from '$lib/core'

  export let count: number | null
  export let matches: EvidenceDuplicate[] = []
  export let checking = false
  export let context: `upload` | `submitted` = `upload`
  export let onOpen: (id: number) => void
</script>

{#if checking && context === `upload`}
  <p class="duplicate-notice" role="status">Checking for duplicate files. You can continue.</p>
{:else if count === null && context === `upload`}
  <p class="duplicate-notice" role="status">Duplicate check unavailable. You can still submit this file.</p>
{:else if count !== null && count > 0}
  <div class="duplicate-notice" role="status">
    <strong>{context === `submitted` ? `Identical file` : `Duplicate: ${count} identical file(s) found`}</strong>
    {#if matches.length}
      <ul>
        {#each matches as match (match.id)}
          <li><button type="button" on:click={() => onOpen(match.id)}>Evidence #{match.id} · {match.playfabId}</button></li>
        {/each}
      </ul>
    {/if}
    {#if context === `upload` && count !== null && count > matches.length}<small>Showing {matches.length} of {count} matching files.</small>{/if}
  </div>
{/if}

<style lang="scss">
  .duplicate-notice { display: grid; gap: var(--gutter-sm); margin: 0; padding: var(--gutter-sm); border: 1px solid var(--color-accent-tertiary); border-radius: var(--radius); color: var(--color-light-secondary); background: rgbaa(var(--color-accent-tertiary), .08); font-size: var(--font-size-xs); }
  .duplicate-notice strong { color: var(--color-accent-tertiary); }
  .duplicate-notice ul { display: grid; gap: 4px; margin: 0; padding-left: var(--gutter-md); }
  .duplicate-notice button { padding: 0; border: 0; color: var(--color-light-secondary); background: transparent; text-align: left; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
  .duplicate-notice small { color: var(--color-light-tertiary); }
</style>
