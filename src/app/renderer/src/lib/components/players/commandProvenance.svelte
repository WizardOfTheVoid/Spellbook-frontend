<script lang="ts">
  import type { CommandProvenance } from '@spellbook/shared/commandObservations'
  import { authState } from '$lib/auth/user'
  import DateStamp from '$lib/components/ui/dateStamp.svelte'
  import { commandOriginLabel } from './commandProvenanceView'

  export let occurrences: readonly CommandProvenance[] = []
  let viewer = $authState.user
  $: if (viewer !== $authState.user) { viewer = $authState.user; occurrences = [] }
</script>

{#if $authState.user?.isSuperadmin && occurrences.length}
  <div class="command-provenance">
    {#each occurrences as item (item.id)}
      <div>
        <strong>{commandOriginLabel(item.origin)}</strong>
        <small>Admin #{item.actorId} · <DateStamp value={item.observedAtUtc} format="dateTime" styled={false} /></small>
        <code>{item.command}</code>
      </div>
    {/each}
  </div>
{/if}

<style lang="scss">
  .command-provenance, .command-provenance > div { display: grid; gap: var(--gutter-sm); }
  .command-provenance { margin-top: var(--gutter-md); font-size: var(--font-size-xs); }
  small { color: var(--color-light-tertiary); }
  code { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
