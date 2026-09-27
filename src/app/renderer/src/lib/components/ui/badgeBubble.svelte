<script lang="ts">
  export let count: number
  export let color = `var(--color-accent-primary)`
  export let floating = false
</script>

{#if count > 0}
  <span class="badge-bubble" class:badge-bubble--floating={floating} style={`--badge-bubble-color: ${color}`} aria-hidden="true">{count}</span>
{/if}

<style lang="scss">
  .badge-bubble { min-width: 16px; height: 16px; display: inline-grid; place-items: center; border: 1px solid var(--color-dark-primary); border-radius: 50%; padding: 0 3px; color: var(--color-dark-primary); background: var(--badge-bubble-color); font-size: var(--font-size-xs); font-weight: var(--font-weight-medium); line-height: 1; }
  .badge-bubble--floating { position: absolute; top: -4px; right: -4px; }
</style>
