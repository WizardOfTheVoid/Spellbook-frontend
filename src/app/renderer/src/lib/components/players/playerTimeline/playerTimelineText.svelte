<script lang="ts">
  import type { PlayerTimelineSegment, PlayerTimelineTarget } from '@spellbook/shared/playerTimeline'
  import type { PlayerAction } from '$lib/core'
  import { SFX } from '$lib/global/sfx'
  import { tooltip } from '$lib/utils/tooltip'
  import PlayerTimelineLinkTooltip from './playerTimelineLinkTooltip.svelte'
  import type { PlayerTimelinePreviewLoader } from './playerTimelinePreview'

  export let segments: PlayerTimelineSegment[]
  export let actions: PlayerAction[]
  export let previewLoader: PlayerTimelinePreviewLoader
  export let onOpenTarget: (target: PlayerTimelineTarget) => void

  function open(event: MouseEvent, target: PlayerTimelineTarget): void {
    event.preventDefault()
    event.stopPropagation()
    SFX.play(`select`)
    onOpenTarget(target)
  }
</script>

{#each segments as segment}
  {#if segment.target}
    {#snippet preview()}
      <PlayerTimelineLinkTooltip {actions} {previewLoader} target={segment.target!} />
    {/snippet}
    <button type="button" class="timeline-link"
      use:tooltip={{ text: segment.tooltip ?? segment.text, content: preview }}
      on:click={(clickEvent) => open(clickEvent, segment.target!)}>{segment.text}</button>
  {:else}
    <span title={segment.tooltip}>{segment.text}</span>
  {/if}
{/each}

<style lang="scss">
  .timeline-link {
    display: inline;
    border: 0;
    padding: 0;
    background: none;
    color: var(--white);
    font: inherit;
    cursor: pointer;
    text-align: left;
    white-space: normal;
    overflow-wrap: anywhere;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .timeline-link:hover, .timeline-link:focus-visible {
    text-decoration-thickness: 2px;
  }
</style>
