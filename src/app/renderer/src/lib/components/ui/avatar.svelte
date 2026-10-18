<script lang="ts">
  import IconBadge from './IconBadge.svelte'

  export let src: string | null = null
  export let name: string
  export let size: `sm` | `md` | `lg` = `sm`
  let failedSource: string | null = null
  $: source = src?.trim() || null
</script>

<span class={`avatar avatar--${size}`} role="img" aria-label={name}>
  {#if source && failedSource !== source}
    <img src={source} alt="" on:error={() => failedSource = source}>
  {:else}
    <IconBadge name="fa-user" {size} shape="round" />
  {/if}
</span>

<style lang="scss">
  .avatar { flex: 0 0 auto; display: inline-grid; place-items: center; border-radius: 50%; overflow: hidden; }
  .avatar--sm { width: 28px; height: 28px; }
  .avatar--md { width: 36px; height: 36px; }
  .avatar--lg { width: var(--avatar-size); height: var(--avatar-size); }
  .avatar :global(.icon-badge) { width: 100%; height: 100%; }
  img { width: 100%; height: 100%; object-fit: cover; }
</style>
