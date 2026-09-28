<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte'
  import { getAdminName } from '@spellbook/shared/adminName.js'
  import type { EvidenceComment, EvidenceItem, PlayerAction, PlayerNotePlayerReference, PlayerNoteUserReference } from '$lib/core'
  import { authState } from '$lib/auth/user'
  import { addEvidenceComment, deleteEvidenceComment, listEvidenceComments } from '$lib/utils/evidenceApi'
  import { fetchAllPlayerActions } from '$lib/utils/playerActionsApi'
  import { fetchAllUserReferences } from '$lib/utils/playerNotesApi'
  import { isPlayerNoteValid } from '$lib/utils/playerNotes'
  import { getPlayers } from '$lib/utils/playersApi'
  import { notifyError } from '$lib/notifications/notificationEvents'
  import { canDeleteEvidenceComment } from './evidenceViewerState'
  import { formatEvidenceTime } from './evidenceTimeline'
  import Button from '$lib/components/ui/Button.svelte'
  import IconButton from '$lib/components/ui/IconButton.svelte'
  import Comment from '$lib/components/ui/comment.svelte'
  import PlayerNoteContent from '../PlayerNoteContent.svelte'
  import PlayerNoteEditor from '../PlayerNoteEditor.svelte'
  import PlayerActionDetail from '../PlayerActionDetail.svelte'
  import PlayerNoteUserDetail from '../PlayerNoteUserDetail.svelte'

  export let evidence: EvidenceItem
  export let onOpenPlayer: (player: PlayerNotePlayerReference) => void
  export let positionMs = 0
  export let getPositionMs: () => number = () => positionMs
  export let onCommentsChange: (comments: EvidenceComment[], countDelta: number) => void = () => undefined
  export let onSeek: (positionMs: number, commentId: number) => void = () => undefined
  let comments: EvidenceComment[] = []
  let highlightedCommentId: number | null = null
  let submissionPositionMs: number | null = null
  const commentElements: Record<number, HTMLDivElement | undefined> = {}
  let actions: PlayerAction[] = []
  let users: PlayerNoteUserReference[] = []
  let players: PlayerNotePlayerReference[] = [{ id: evidence.playerId, playfabId: evidence.playfabId, latestName: evidence.nickname }]
  let body = ``
  let busy = false
  let loading = true
  let deleting = new Set<number>()
  let disposed = false
  let selectedAction: PlayerAction | null = null
  let selectedUser: PlayerNoteUserReference | null = null
  $: editorActions = uniqueById([...actions, ...comments.flatMap(comment => comment.actionReferences)])
  $: editorUsers = uniqueById([...users, ...comments.flatMap(comment => comment.userReferences)])
  $: editorPlayers = uniqueById([...players, ...comments.flatMap(comment => comment.playerReferences)])

  onMount(() => { void loadComments(); void loadReferences() })
  onDestroy(() => { disposed = true })

  async function loadComments(): Promise<void> {
    try {
      const loaded = await listEvidenceComments(evidence.id)
      if (!disposed) setComments(uniqueById([...loaded, ...comments]))
    } catch (error) { if (!disposed) notifyError(error instanceof Error ? error.message : `Comments could not be loaded.`) }
    finally { if (!disposed) loading = false }
  }

  async function loadReferences(): Promise<void> {
    const results = await Promise.allSettled([fetchAllPlayerActions(evidence.playerId), fetchAllUserReferences()])
    if (disposed) return
    if (results[0].status === `fulfilled`) actions = results[0].value
    if (results[1].status === `fulfilled`) users = results[1].value
    for (const result of results) if (result.status === `rejected`) console.error(`[EvidenceComments] Reference data failed:`, result.reason)
  }

  async function searchPlayers(query: string): Promise<PlayerNotePlayerReference[]> {
    if (!query.trim()) return editorPlayers
    try {
      const page = await getPlayers({ search: query.trim() })
      const found = page.players.slice(0, 12).map(({ id, playfabId, latestName }) => ({ id, playfabId, latestName }))
      if (!disposed) players = uniqueById([...players, ...found])
      return found
    } catch { return [] }
  }

  async function postComment(): Promise<void> {
    if (!isPlayerNoteValid(body) || busy || !$authState.user) return
    submissionPositionMs = evidence.file.kind === `video` ? getPositionMs() : null
    busy = true
    try {
      const comment = await addEvidenceComment(evidence.id, body, submissionPositionMs)
      if (!disposed) { setComments([...comments, comment], 1); body = `` }
    } catch (error) { if (!disposed) notifyError(error instanceof Error ? error.message : `Comment could not be added.`) }
    finally { if (!disposed) busy = false }
  }

  async function removeComment(comment: EvidenceComment): Promise<void> {
    if (!canDeleteEvidenceComment(comment, $authState.user) || deleting.has(comment.id)) return
    deleting = new Set([...deleting, comment.id])
    try {
      await deleteEvidenceComment(evidence.id, comment.id)
      if (!disposed) setComments(comments.filter(item => item.id !== comment.id), -1)
    } catch (error) { if (!disposed) notifyError(error instanceof Error ? error.message : `Comment could not be deleted.`) }
    finally { if (!disposed) deleting = new Set([...deleting].filter(id => id !== comment.id)) }
  }

  function setComments(next: EvidenceComment[], countDelta = 0): void {
    comments = next
    onCommentsChange(next, countDelta)
  }

  export async function focusComment(id: number): Promise<void> {
    if (disposed || !comments.some(comment => comment.id === id)) return
    selectedAction = null
    selectedUser = null
    highlightedCommentId = id
    await tick()
    if (disposed || highlightedCommentId !== id) return
    const element = commentElements[id]
    element?.scrollIntoView({ block: `nearest`, behavior: `smooth` })
    element?.focus({ preventScroll: true })
  }

  const uniqueById = <T extends { id: number }>(items: T[]) => [...new Map(items.map(item => [item.id, item])).values()]
  const openAction = (action: PlayerAction) => { selectedAction = action; selectedUser = null }
  const openUser = (user: PlayerNoteUserReference) => { selectedUser = user; selectedAction = null }
</script>

<section class="evidence-comments" aria-label="Evidence comments">
  <h2>Comments</h2>
  {#if selectedAction || selectedUser}
    <Button label="Back to comments" icon="fa-arrow-left" size="sm" onClick={() => { selectedAction = null; selectedUser = null }} />
    <div class="evidence-comments__thread">
      {#if selectedAction}<PlayerActionDetail action={selectedAction} />{:else if selectedUser}<PlayerNoteUserDetail user={selectedUser} />{/if}
    </div>
  {:else}
    <div class="evidence-comments__thread" aria-busy={loading}>
      {#each comments as comment (comment.id)}
        {@const authorName = getAdminName(comment.author, comment.authorName.trim() || `Unknown admin`)}
        <div bind:this={commentElements[comment.id]} data-comment-id={comment.id} tabindex="-1">
          <Comment author={authorName} datetime={comment.createdAt} avatarUrl={comment.author?.avatarUrl ?? null} highlighted={highlightedCommentId === comment.id}
            onClick={evidence.file.kind === `video` && typeof comment.positionMs === `number` ? () => onSeek(comment.positionMs!, comment.id) : null}>
            {#snippet metadata()}
              {#if evidence.file.kind === `video` && typeof comment.positionMs === `number`}
                <span>@</span><button class="evidence-comments__time" type="button" on:click={() => onSeek(comment.positionMs!, comment.id)} aria-label={`Seek to ${formatEvidenceTime(comment.positionMs)}`}>{formatEvidenceTime(comment.positionMs)}</button>
              {/if}
            {/snippet}
            {#snippet actions()}
              {#if canDeleteEvidenceComment(comment, $authState.user)}
                <IconButton icon="fa-trash" ariaLabel="Delete comment" tooltip="Delete comment" size="sm" disabled={deleting.has(comment.id)} onClick={() => void removeComment(comment)} />
              {/if}
            {/snippet}
            <PlayerNoteContent note={{ content: comment.body, actionReferences: comment.actionReferences, userReferences: comment.userReferences }} players={comment.playerReferences} onOpenAction={openAction} onOpenUser={openUser} {onOpenPlayer} />
          </Comment>
        </div>
      {:else}<p>{loading ? `Loading comments...` : `No comments yet.`}</p>{/each}
    </div>
    {#if $authState.user}
      <div class="evidence-comments__composer">
        <strong>Add a comment</strong>
        <PlayerNoteEditor content={body} playerId={evidence.playerId} actions={editorActions} users={editorUsers} players={editorPlayers} disabled={busy} onChange={value => body = value} onSubmit={() => void postComment()} onSearchPlayers={searchPlayers} onOpenAction={id => { const action = editorActions.find(item => item.id === id); if (action) openAction(action) }} onOpenUser={id => { const user = editorUsers.find(item => item.id === id); if (user) openUser(user) }} onOpenPlayer={id => { const player = editorPlayers.find(item => item.id === id); if (player) onOpenPlayer(player) }} />
        <div class="evidence-comments__composer-actions">
          <small>{body.trim().length}/1000</small>
          <Button label={evidence.file.kind === `video` ? `Comment @ ${formatEvidenceTime(busy ? submissionPositionMs ?? 0 : positionMs)}` : `Comment`} variant="primary" size="sm" disabled={busy || !isPlayerNoteValid(body)} onClick={() => void postComment()} />
        </div>
      </div>
    {/if}
  {/if}
</section>

<style lang="scss">
  .evidence-comments { min-width: 0; min-height: 0; flex: 1; display: flex; flex-direction: column; gap: var(--gutter-md); }
  h2, p { margin: 0; }
  h2 { font-size: var(--font-size-md); font-weight: var(--font-weight-medium); }
  .evidence-comments__thread { min-width: 0; min-height: 0; flex: 1; overflow: auto; display: grid; align-content: start; gap: var(--gutter-sm); }
  .evidence-comments__thread > p { color: var(--color-light-tertiary); font-size: var(--font-size-sm); padding: var(--gutter-md) 0; }
  .evidence-comments__thread > div { min-width: 0; outline: none; }
  .evidence-comments__time { padding: 0; border: 0; border-radius: 0; color: inherit; background: none; font: inherit; text-decoration: underline; cursor: pointer; }
  small { color: var(--color-light-tertiary); font-size: var(--font-size-xs); }
  .evidence-comments__composer { min-height: 0; max-height: 50%; overflow: auto; display: grid; gap: var(--gutter-sm); padding-top: var(--gutter-md); border-top: 1px solid var(--color-dark-secondary); }
  .evidence-comments__composer > strong { font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); }
  .evidence-comments__composer-actions { display: flex; align-items: center; justify-content: space-between; gap: var(--gutter-sm); }
  @media (max-width: 800px) {
    .evidence-comments { flex: 0 0 auto; }
    .evidence-comments__thread { flex: none; overflow: visible; }
    .evidence-comments__composer { max-height: none; overflow: visible; }
  }
</style>
