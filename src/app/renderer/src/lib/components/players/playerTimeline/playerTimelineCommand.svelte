<script lang="ts">
  import type { Snippet } from 'svelte'
  import { splitTimelineCommand } from './playerTimelineCommand'

  export let value: string
  export let name: string | undefined = undefined
  export let parameters: Snippet<[string]> | undefined = undefined

  $: command = splitTimelineCommand(value, name)
</script>

<span class="timeline-command">
  <code class="timeline-command__name">{command.name}</code>
  {#if command.parameters}
    <span class="timeline-command__parameters">
      {#if parameters}{@render parameters(command.parameters)}{:else}{command.parameters}{/if}
    </span>
  {/if}
</span>

<style lang="scss">
  .timeline-command {
    display: flex;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: var(--gutter-sm);
    line-height: 1.5;
  }

  .timeline-command__name, .timeline-command__parameters {
    max-width: 100%;
    border: 1px solid var(--color-dark-tertiary);
    border-radius: calc(var(--radius) / 2);
    padding: 0.25em 0.6em;
    overflow-wrap: anywhere;
    background: transparent;
    font: var(--font-weight-medium) var(--font-size-label) / 1.5 ui-monospace, Consolas, monospace;
  }

  .timeline-command__name {
    flex-shrink: 0;
    border-color: rgbaa(var(--color-accent-primary), 0.4);
    color: var(--color-accent-primary);
  }

  .timeline-command__parameters {
    min-width: 0;
    border-color: rgbaa(var(--color-light-tertiary), 0.25);
    color: var(--color-light-secondary);
    white-space: pre-wrap;
  }

  .timeline-command__parameters :global(.timeline-link) {
    background: transparent;
    color: inherit;
    font: inherit;
    white-space: inherit;
  }
</style>
