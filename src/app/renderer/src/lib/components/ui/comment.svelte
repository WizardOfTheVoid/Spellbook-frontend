<script lang="ts">
  import type { Snippet } from 'svelte'
  import Avatar from './avatar.svelte'
  import DateStamp from './dateStamp.svelte'

  export let author: string
  export let datetime: string
  export let children: Snippet
  export let actions: Snippet | undefined = undefined
  export let avatar: Snippet | undefined = undefined
  export let avatarUrl: string | null = null
  export let metadata: Snippet | undefined = undefined
  export let highlighted = false
  export let onClick: (() => void) | null = null

  function handleClick(event: MouseEvent): void {
    if (!onClick || event.defaultPrevented) return
    const control = event.target instanceof Element
      ? event.target.closest(`button, a, input, select, textarea, [role="button"], [contenteditable="true"]`) : null
    if (control && control !== event.currentTarget || window.getSelection()?.toString()) return
    onClick()
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (!onClick || event.target !== event.currentTarget || event.key !== `Enter` && event.key !== ` `) return
    event.preventDefault()
    onClick()
  }
</script>

{#snippet content()}
  <header class="comment__header">
    {#if avatar}{@render avatar()}{:else}<Avatar src={avatarUrl} name={author} size="lg" />{/if}
    <div class="comment__identity">
      <strong>{author}</strong>
      <span class="comment__date"><DateStamp value={datetime} format="dateTime" styled={false} />{#if metadata}{@render metadata()}{/if}</span>
    </div>
    {#if actions}<div class="comment__actions">{@render actions()}</div>{/if}
  </header>
  <div class="comment__body">{@render children()}</div>
{/snippet}

{#if onClick}
  <div class="comment comment--clickable" class:comment--highlighted={highlighted} role="button" tabindex="0"
    aria-label={`Select comment by ${author}`} on:click={handleClick} on:keydown={handleKeydown}>
    {@render content()}
  </div>
{:else}
  <article class="comment" class:comment--highlighted={highlighted}>{@render content()}</article>
{/if}

<style lang="scss">
  .comment { min-width: 0; display: grid; gap: var(--gutter-md); padding: var(--gutter-md); border: 1px solid var(--color-dark-secondary); border-radius: var(--radius); background: color-mix(in srgb, var(--color-dark-primary), var(--color-light-tertiary) 3%); }
  .comment--highlighted { border-color: var(--color-accent-primary); background: color-mix(in srgb, var(--color-dark-primary), var(--color-accent-primary) 12%); }
  .comment--clickable { cursor: pointer; }
  .comment--clickable:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 2px; }
  .comment__header { display: flex; align-items: flex-start; gap: var(--gutter-sm); }
  .comment__identity { min-width: 0; flex: 1; display: grid; gap: 4px; }
  .comment__identity strong { overflow-wrap: anywhere; font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); }
  .comment__date { color: var(--color-light-tertiary); font-size: var(--font-size-xs); display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px; }
  .comment__actions { flex: 0 0 auto; display: flex; gap: var(--gutter-sm); }
  .comment__body { min-width: 0; overflow-wrap: anywhere; }
</style>
