<script lang="ts">
  import { getAdminName } from '@spellbook/shared/adminName.js'
  import type { EvidenceComment } from '$lib/core'
  import Avatar from '$lib/components/ui/avatar.svelte'
  import PlayerNoteContent from '../PlayerNoteContent.svelte'
  import { tooltip as tooltipAction } from '$lib/utils/tooltip'
  import { formatEvidenceTime, groupEvidenceComments, nextEvidenceMarkerComment, type EvidenceMarkerGroup } from './evidenceTimeline'

  export let player: HTMLElement | undefined
  export let comments: EvidenceComment[] = []
  export let durationMs = 0
  export let selectedCommentId: number | null = null
  export let onSelectComment: (id: number) => void = () => undefined
  let trackWidth = 0
  $: groups = groupEvidenceComments(comments, durationMs, trackWidth)

  function select(group: EvidenceMarkerGroup): void {
    const comment = nextEvidenceMarkerComment(group.comments, selectedCommentId)
    if (comment) onSelectComment(comment.id)
  }

  function attachToTrack(node: HTMLElement, target: HTMLElement | undefined) {
    let stop: () => void = () => undefined
    function watch(nextPlayer: HTMLElement | undefined): void {
      stop()
      node.hidden = true
      trackWidth = 0
      if (!nextPlayer) return
      let slider: HTMLElement | null = null
      let frame = 0
      let active = true
      const resized = new ResizeObserver(schedule)
      const observer = new MutationObserver(schedule)
      function attach(): void {
        if (!active || !nextPlayer?.isConnected) return
        const next = nextPlayer.querySelector<HTMLElement>(`media-video-layout media-time-slider`)
        if (!next?.parentElement) {
          node.hidden = true
          trackWidth = 0
          return
        }
        if (slider !== next) {
          if (slider) resized.unobserve(slider)
          slider = next
          resized.observe(next)
        }
        if (node.parentElement !== next.parentElement) next.parentElement.append(node)
        node.style.left = `${next.offsetLeft}px`
        node.style.top = `${next.offsetTop + next.clientHeight / 2}px`
        node.style.width = `${next.clientWidth}px`
        trackWidth = next.clientWidth
        node.hidden = false
      }
      function schedule(): void {
        if (active && !frame) frame = requestAnimationFrame(() => {
          frame = 0
          attach()
        })
      }
      observer.observe(nextPlayer, { childList: true, subtree: true })
      resized.observe(nextPlayer)
      schedule()
      stop = () => {
        active = false
        observer.disconnect()
        resized.disconnect()
        cancelAnimationFrame(frame)
      }
    }
    watch(target)
    return { update: watch, destroy: () => stop() }
  }
</script>

<div class="evidence-timeline" hidden use:attachToTrack={player} role="group" aria-label="Timed comments">
  {#each groups as group (group.comments[0].id)}
    {@const comment = group.comments.find(item => item.id === selectedCommentId) ?? group.comments[0]}
    {@const name = getAdminName(comment.author, comment.authorName.trim() || `Unknown admin`)}
    {@const time = formatEvidenceTime(comment.positionMs)}
    {#snippet preview()}
      <div class="evidence-timeline__preview"><strong>{name}:</strong> <PlayerNoteContent
        note={{ content: comment.body, actionReferences: comment.actionReferences, userReferences: comment.userReferences }} players={comment.playerReferences} /></div>
    {/snippet}
    <button type="button" class="evidence-timeline__marker" class:evidence-timeline__marker--selected={group.comments.some(item => item.id === selectedCommentId)}
      style={`--marker-position: ${group.percentage}%`} use:tooltipAction={{ text: `${name}: ${comment.body}`, content: preview, detailed: false, placement: `top` }}
      aria-label={`${name} at ${time}${group.comments.length > 1 ? `, ${(group.comments.findIndex(item => item.id === comment.id) + 1)} of ${group.comments.length} comments. Select again for the next comment.` : ``}`}
      on:pointerdown|stopPropagation={() => undefined} on:pointerup|stopPropagation={() => undefined}
      on:keydown|stopPropagation={() => undefined} on:keyup|stopPropagation={() => undefined}
      on:dblclick|stopPropagation={() => undefined} on:click|stopPropagation={() => select(group)}>
      <Avatar src={comment.author?.avatarUrl ?? null} {name} size="md" />
      {#if group.comments.length > 1}<span class="evidence-timeline__count" aria-hidden="true">{group.comments.length}</span>{/if}
    </button>
  {/each}
</div>

<style lang="scss">
  .evidence-timeline { position: absolute; z-index: 2; height: 36px; transform: translateY(calc(-100% - var(--gutter-sm))); pointer-events: none; }
  .evidence-timeline__marker { position: absolute; left: clamp(18px, var(--marker-position), calc(100% - 18px)); display: grid; padding: 0; border: 0; border-radius: 50%; color: var(--color-light-primary); background: var(--color-dark-primary); transform: translateX(-50%); pointer-events: auto; cursor: pointer; }
  .evidence-timeline__marker:hover, .evidence-timeline__marker:focus-visible, .evidence-timeline__marker--selected { outline: 2px solid var(--color-accent-primary); outline-offset: 2px; }
  .evidence-timeline__count { position: absolute; top: -6px; right: -6px; min-width: 16px; padding: 0 var(--gutter-sm); border: 1px solid var(--color-light-tertiary); border-radius: var(--radius); color: var(--color-light-primary); background: var(--color-dark-primary); font-size: var(--font-size-xs); }
  .evidence-timeline__preview :global(.player-note-content) { display: inline; }
</style>
