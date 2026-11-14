<script lang="ts">
  import { cheatOptions } from '$lib/utils/evidenceApi'
  import Tag from '$lib/components/ui/Tag.svelte'

  export let subtypes: string[]
</script>

<span class="evidence-tags" aria-label="Cheat subtypes">
  {#each subtypes as subtype}<Tag label={cheatOptions.find(option => option.value === subtype)?.label ?? subtype} />{/each}
</span>

<style lang="scss">
  .evidence-tags { display: flex; flex-wrap: wrap; gap: var(--gutter-sm); }
</style>
