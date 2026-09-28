<script lang="ts">
	import { getAdminName } from "@spellbook/shared/adminName.js"

  import type { PlayerAction, PlayerNote, PlayerNotePlayerReference, PlayerNoteUserReference } from "$lib/core"
  import { playerReferenceName } from '$lib/utils/playerNotePlayerReferences'
  import { tooltip as tooltipAction } from "$lib/utils/tooltip"
  import { actionAuthor, actionLabel } from "$lib/utils/playerActions"
  import { parsePlayerNoteDisplay } from "$lib/utils/playerNoteDisplay"
  import { formatFullDateTime } from "$lib/utils/playerUtils"
  import PlayerNoteMarkdown from './notes/playerNoteMarkdown.svelte'

  export let note: Pick<PlayerNote, `content` | `actionReferences` | `userReferences`>
  export let players: PlayerNotePlayerReference[] | undefined = undefined
  export let onOpenAction: (action: PlayerAction) => void = () => undefined
  export let onOpenUser: (user: PlayerNoteUserReference) => void = () => undefined
  export let onOpenPlayer: (player: PlayerNotePlayerReference) => void = () => undefined

  $: segments = parsePlayerNoteDisplay(note.content, players !== undefined)
  $: actions = new Map(note.actionReferences.map(action => [action.id, action]))
  $: users = new Map(note.userReferences.map(user => [user.id, user]))
  $: playerReferences = new Map(players?.map(player => [player.id, player]))

  const actionTooltip = (action: PlayerAction) => [
    actionLabel(action),
    action.reason?.trim() || `No reason recorded`,
    action.gameServer?.displayName?.trim() || action.gameServer?.name?.trim() || (action.gameServerId ? `Server #${action.gameServerId}` : `Community Hivemind`),
    `Admin: ${actionAuthor(action)}`,
    `Scope: ${action.scope}`,
    formatFullDateTime(action.createdAt),
  ].join(`\n`)

  const userTooltip = (user: PlayerNoteUserReference) => [
    getAdminName(user),
    `@${user.username}`,
    user.isActive && !user.bannedAt ? `Active` : `Inactive`,
  ].join(`\n`)
</script>

<div class="player-note-content">
  {#key note.content}
    <PlayerNoteMarkdown nodes={segments}>
      {#snippet reference(segment)}
        {#if segment.kind === `action`}
          {@const action = actions.get(segment.id)}
          <button
            type="button"
            class="player-note-content__reference"
            disabled={!action}
            use:tooltipAction={action ? actionTooltip(action) : `Recorded action #${segment.id}`}
            on:click={() => action && onOpenAction(action)}
          >#{action ? actionLabel(action) : `Action ${segment.id}`}</button>
        {:else if segment.kind === `player`}
          {@const player = playerReferences.get(segment.id)}
          <button
            type="button"
            class="player-note-content__reference"
            disabled={!player}
            use:tooltipAction={player?.playfabId ?? `Player #${segment.id}`}
            on:click={() => player && onOpenPlayer(player)}
          >@{player ? playerReferenceName(player) : `Player ${segment.id}`}</button>
        {:else}
          {@const user = users.get(segment.id)}
          <button
            type="button"
            class="player-note-content__reference player-note-content__reference--user"
            disabled={!user}
            use:tooltipAction={user ? userTooltip(user) : `User #${segment.id}`}
            on:click={() => user && onOpenUser(user)}
          >@{getAdminName(user, `User ${segment.id}`)}</button>
        {/if}
      {/snippet}
    </PlayerNoteMarkdown>
  {/key}
</div>

<style lang="scss">
  .player-note-content { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-synthesis: style; }
  .player-note-content__reference {
    display: inline-flex;
    margin: 0 0.12rem;
    border: 1px solid rgbaa(var(--color-accent-primary), 0.5);
    border-radius: 0.35rem;
    padding: 0.08rem 0.38rem;
    background: transparent;
    color: var(--color-light-primary);
    font: inherit;
    line-height: 1.35;
    cursor: pointer;
    transition: border-color 120ms ease, color 120ms ease, transform 80ms ease;
  }
  .player-note-content__reference--user { border-color: rgba(118, 177, 255, 0.52); }
  .player-note-content__reference:not(:disabled):hover { border-color: var(--color-primary); color: var(--color-primary); }
  .player-note-content__reference:not(:disabled):active { border-color: var(--color-light-primary); transform: translateY(1px); }
  .player-note-content__reference:disabled { opacity: 0.72; }
</style>
