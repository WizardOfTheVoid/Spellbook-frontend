<script lang="ts">
  import Tag from '$lib/components/ui/Tag.svelte'
  import { itemPresentation } from './itemPresentation'

  let { value }: { value: string | null } = $props()
  const item = $derived(itemPresentation(value))
</script>

<span class="item-label" title={item.raw ?? undefined}>
  <span>{item.label}</span>
  {#each item.tags as tag}<Tag label={tag} compact />{/each}
</span>

<style>
  .item-label { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; min-width: 0; }
  .item-label > span { overflow-wrap: anywhere; }
</style>
