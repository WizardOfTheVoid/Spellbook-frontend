<script lang="ts">
  import type { PlayerTimelineTarget } from '@spellbook/shared/playerTimeline'
  import type { PlayerAction } from '$lib/core'
  import Icon from '$lib/components/ui/Icon.svelte'
  import DateStamp from '$lib/components/ui/dateStamp.svelte'
  import { SFX } from '$lib/global/sfx'
  import { timelinePresentation } from './playerTimelinePresentation'
  import type { PlayerTimelinePreviewLoader } from './playerTimelinePreview'
  import type { TimelineDisplayEvent } from './playerTimelinePresence'
  import PlayerOnlineIndicator from '../PlayerOnlineIndicator.svelte'
  import PlayerTimelineText from './playerTimelineText.svelte'

  export let event: TimelineDisplayEvent
  export let actions: PlayerAction[]
  export let previewLoader: PlayerTimelinePreviewLoader
  export let onOpenTarget: (target: PlayerTimelineTarget) => void

  let detailsElement: HTMLDetailsElement
  $: presentation = timelinePresentation(event)
  $: hasDetails = event.details.length > 0
</script>

{#snippet heading()}
  <span class="timeline-card__summary">
    {#if event.segments}
      <PlayerTimelineText segments={event.segments} {actions} {previewLoader} {onOpenTarget} />
    {:else}
      {event.summary}
    {/if}
    {#if event.current && event.kind === `server`}
      <span class="timeline-card__online"><PlayerOnlineIndicator tooltipOnParent focusable={false} /></span>
    {/if}
  </span>
  <span class="timeline-card__time">
    <DateStamp value={event.occurredAt} format="time" styled={false} />
    {#if event.current} · <span class="timeline-card__current">Now</span>{/if}
  </span>
  {#if hasDetails}
    <span class="timeline-card__chevron" aria-hidden="true"><Icon name="fa-chevron-down" size="xs" type="solid" /></span>
  {/if}
{/snippet}

<div class={`timeline-card timeline-card--${presentation.tone}`} class:timeline-card--wanted={event.kind === `wanted`}>
  <span class="timeline-card__marker" aria-hidden="true">
    <Icon name={presentation.icon} type="solid" />
  </span>
  {#if hasDetails}
    <details bind:this={detailsElement}>
      <summary on:click={() => SFX.play(detailsElement.open ? `close` : `open`)}>
        {@render heading()}
      </summary>
      <div class="timeline-card__details">
        {#each event.details as item}
          <div class="timeline-card__detail">
            <span>{item.label}</span>
            <strong>
              {#if item.format === `dateTime`}
                <DateStamp value={item.value} format="dateTime" styled={false} />
              {:else}
                <PlayerTimelineText
                  segments={[{ text: item.value, target: item.target, tooltip: item.tooltip }]}
                  {actions}
                  {previewLoader}
                  {onOpenTarget}
                />
              {/if}
            </strong>
          </div>
        {/each}
      </div>
    </details>
  {:else}
    <div class="timeline-card__static">{@render heading()}</div>
  {/if}
</div>

<style lang="scss">
  .timeline-card {
    --timeline-marker-size: calc(var(--gutter-lg) + var(--gutter-sm));
    --timeline-rail-width: 2px;
    --timeline-accent: var(--color-light-primary);
    --timeline-border: var(--color-dark-secondary);
    --timeline-background: transparent;
    --timeline-hover: rgbaa(var(--color-dark-secondary), 0.05);

    position: relative;
    display: grid;
    grid-template-columns: var(--timeline-marker-size) minmax(0, 1fr);
    gap: var(--gutter-sm);
    padding-bottom: var(--gutter-md);
  }

  .timeline-card--danger {
    --timeline-accent: var(--color-danger);
    --timeline-border: var(--color-danger);
  }

  .timeline-card--warning {
    --timeline-accent: var(--color-accent-tertiary);
    --timeline-border: var(--color-accent-tertiary);
  }

  .timeline-card--accent {
    --timeline-accent: var(--color-accent-primary);
    --timeline-border: var(--color-accent-primary);
  }

  .timeline-card--wanted {
    --timeline-background: rgbaa(var(--color-danger), 0.1);
    --timeline-hover: rgbaa(var(--color-danger), 0.14);
  }

  .timeline-card::before {
    content: '';
    position: absolute;
    left: calc((var(--timeline-marker-size) - var(--timeline-rail-width)) / 2);
    top: 0;
    bottom: 0;
    width: var(--timeline-rail-width);
    background: var(--color-dark-tertiary);
  }

  .timeline-card:first-child::before {
    top: calc(var(--gutter-sm) + var(--timeline-marker-size) / 2);
  }

  .timeline-card:last-child { padding-bottom: 0; }
  .timeline-card:last-child::before {
    bottom: auto;
    height: calc(var(--gutter-sm) + var(--timeline-marker-size) / 2);
  }

  .timeline-card:only-child::before { display: none; }

  .timeline-card__marker {
    z-index: 1;
    align-self: start;
    display: grid;
    place-items: center;
    width: var(--timeline-marker-size);
    height: var(--timeline-marker-size);
    margin-top: var(--gutter-sm);
    border: 2px solid var(--timeline-accent);
    border-radius: 50%;
    background: var(--color-dark-primary);
    color: var(--timeline-accent);
  }

  details, .timeline-card__static {
    min-width: 0;
    border: 1px solid var(--timeline-border);
    border-radius: var(--radius);
    background: var(--timeline-background);
    transition: background-color var(--motion-fast) var(--motion-ease);
  }

  details:hover, details[open] {
    background: var(--timeline-hover);
  }

  summary, .timeline-card__static {
    position: relative;
    min-height: var(--control-height-lg);
    display: grid;
    align-content: center;
    gap: var(--gutter-sm);
    padding: var(--gutter-md);
    padding-right: calc(var(--gutter-md) * 2 + var(--icon-size-md));
  }

  .timeline-card__static { padding-right: var(--gutter-md); }

  summary { cursor: pointer; list-style: none; }

  summary::-webkit-details-marker { display: none; }

  summary:focus-visible {
    outline: 2px solid var(--color-accent-secondary);
    outline-offset: 2px;
    border-radius: var(--radius);
  }

  .timeline-card__chevron {
    position: absolute;
    right: var(--gutter-md);
    top: 50%;
    transform: translateY(-50%);
    color: var(--color-light-tertiary);
  }

  details[open] .timeline-card__chevron { transform: translateY(-50%) rotate(180deg); }

  .timeline-card__summary {
    color: var(--white);
    line-height: 1.4;
    overflow-wrap: anywhere;
  }

  .timeline-card__online {
    display: inline-flex;
    align-items: center;
    height: 1em;
    margin-left: var(--gutter-sm);
    vertical-align: middle;
  }

  .timeline-card__time {
    color: var(--color-light-tertiary);
    font-size: var(--font-size-xs);
  }

  .timeline-card__current { color: var(--color-accent-secondary); }

  .timeline-card__details {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: var(--gutter-md);
    border-top: 1px solid var(--color-dark-secondary);
    padding: var(--gutter-md);
  }

  .timeline-card__detail {
    display: grid;
    gap: var(--gutter-sm);
    overflow-wrap: anywhere;
  }

  .timeline-card__detail > span {
    color: var(--color-light-tertiary);
    font-size: var(--font-size-xs);
  }

  .timeline-card__detail strong {
    color: var(--white);
    font-weight: var(--font-weight-medium);
    white-space: pre-wrap;
  }
</style>
