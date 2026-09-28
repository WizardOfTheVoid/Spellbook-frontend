<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { PlayerNoteDisplayReference, PlayerNoteDisplaySegment } from '$lib/utils/playerNoteDisplay'
  import PlayerNoteMarkdown from './playerNoteMarkdown.svelte'
  import PlayerNoteSpoiler from './playerNoteSpoiler.svelte'

  export let nodes: PlayerNoteDisplaySegment[]
  export let reference: Snippet<[PlayerNoteDisplayReference]>
</script>

{#each nodes as node}
  {#if node.type === `text`}{node.content}
  {:else if node.type === `reference`}{@render reference(node)}
  {:else if node.type === `br`}<br />
  {:else if node.type === `inlineCode`}<code>{node.content}</code>
  {:else if node.type === `codeBlock`}<pre><code>{node.content}</code></pre>
  {:else if node.type === `list`}
    <svelte:element this={node.ordered ? `ol` : `ul`} start={node.ordered ? node.start : undefined}>
      {#each node.items as item}<li><PlayerNoteMarkdown nodes={item} {reference} /></li>{/each}
    </svelte:element>
  {:else if node.type === `heading`}
    <svelte:element this={`h${node.level}`}><PlayerNoteMarkdown nodes={node.content} {reference} /></svelte:element>
  {:else if node.type === `spoiler`}
    <PlayerNoteSpoiler><PlayerNoteMarkdown nodes={node.content} {reference} /></PlayerNoteSpoiler>
  {:else if node.type === `blockQuote`}
    <blockquote><PlayerNoteMarkdown nodes={node.content} {reference} /></blockquote>
  {:else if node.type === `paragraph`}
    <p><PlayerNoteMarkdown nodes={node.content} {reference} /></p>
  {:else if node.type === `subtext`}
    <small><PlayerNoteMarkdown nodes={node.content} {reference} /></small>
  {:else}
    <span class={node.type}><PlayerNoteMarkdown nodes={node.content} {reference} /></span>
  {/if}
{/each}

<style lang="scss">
  .strong { font-weight: var(--font-weight-bold); }
  .em { font-style: italic; }
  .underline { text-decoration: underline; }
  .strikethrough { text-decoration: line-through; }
  h1, h2, h3 { margin: 0.25em 0; line-height: 1.3; }
  h1 { font-size: 1.5em; }
  h2 { font-size: 1.25em; }
  h3 { font-size: 1.1em; }
  p { margin: 0; }
  small { display: block; color: var(--color-light-tertiary); font-size: 0.8em; }
  ul, ol { margin: 0.3em 0; padding-left: 1.5em; white-space: normal; }
  li { white-space: pre-wrap; }
  blockquote { margin: 0.3em 0; border-left: 3px solid var(--color-light-tertiary); padding-left: 0.75em; }
  code { border-radius: 0.2em; padding: 0.1em 0.25em; background: rgba(0, 0, 0, 0.3); font-size: 0.9em; }
  pre { margin: 0.4em 0; overflow-x: auto; white-space: pre-wrap; }
  pre code { display: block; padding: 0.5em; }
</style>
