<script lang="ts">
  import type { Snippet } from 'svelte'
  import { avatarSizes, type AvatarSize } from './avatarSizes'

  export let src: string | null | undefined = null
  export let name: string | null | undefined = null
  export let size: AvatarSize = `sm`
  export let radius: string
  export let fit: `contain` | `cover`
  export let fallback: Snippet
  let className = ``
  export { className as class }

  let previousSource: string | null = null
  let failed = false
  $: source = src?.trim() || null
  $: accessibleName = name?.trim() || null
  $: dimension = typeof size === `number` ? `${size}px` : avatarSizes[size]
  $: if (source !== previousSource) {
    previousSource = source
    failed = false
  }
</script>

<span class={`avatar ${className}`} role={accessibleName ? `img` : undefined} aria-label={accessibleName ?? undefined} aria-hidden={accessibleName ? undefined : true}
  style={`--avatar-frame-size: ${dimension}; --avatar-radius: ${radius}; --avatar-fit: ${fit}`}>
  {#if source && !failed}
    <img src={source} alt="" on:error={() => failed = true}>
  {:else}
    {@render fallback()}
  {/if}
</span>

<style>
  .avatar { box-sizing: border-box; flex: 0 0 auto; display: inline-grid; place-items: center; width: var(--avatar-frame-size); height: var(--avatar-frame-size); border-radius: var(--avatar-radius); overflow: hidden; vertical-align: middle; }
  .avatar :global(.icon-badge) { width: 100%; height: 100%; }
  img { display: block; width: 100%; height: 100%; object-fit: var(--avatar-fit); }
</style>
