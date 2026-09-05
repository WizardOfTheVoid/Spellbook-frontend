<script lang="ts">
  import { onDestroy, onMount } from "svelte"
  import type { PlayerAction, PlayerNote, PlayerNoteScope, PlayerNoteUserReference } from "$lib/core"
  import { authState } from "$lib/auth/user"
  import type { FormOption } from "$lib/types/ui"
  import { notifyError, notifySuccess } from "$lib/notifications/notificationEvents"
  import { tooltip as tooltipAction } from "$lib/utils/tooltip"
  import { fetchAllPlayerActions } from "$lib/utils/playerActionsApi"
  import {
    createPlayerNote,
    fetchAllPlayerNotes,
    fetchAllUserReferences,
    updatePlayerNote,
  } from "$lib/utils/playerNotesApi"
  import {
    canEditPlayerNote,
    createPlayerNoteComposer,
    createPlayerNotesController,
    isPlayerNoteValid,
  } from "$lib/utils/playerNotes"
  import { formatFullDateTime, formatRelativeDateTime } from "$lib/utils/playerUtils"
  import Button from "$lib/components/ui/Button.svelte"
  import PanelHeader from "$lib/components/ui/PanelHeader.svelte"
  import Select from "$lib/components/ui/Select.svelte"
  import PlayerNoteContent from "./PlayerNoteContent.svelte"
  import PlayerNoteEditor from "./PlayerNoteEditor.svelte"

  const SCOPE_OPTIONS: FormOption[] = [
    { value: "me", label: "Me", description: "Only you can see this note." },
    { value: "admins", label: "Admins", description: "All admins can see this note." },
    { value: "public", label: "Public", description: "Included in public outputs." },
  ]

  export let playerId: number
  export let actions: PlayerAction[] = []
  export let adding = false
  export let seedActionId: number | null = null
  export let onOpenAction: (action: PlayerAction) => void = () => undefined
  export let onOpenUser: (user: PlayerNoteUserReference) => void = () => undefined
  export let onNoteCountChange: (noteCount: number) => void = () => undefined

  let notes: PlayerNote[] = []
  let referenceActions: PlayerAction[] = actions
  let referenceUsers: PlayerNoteUserReference[] = []
  let loading = false
  let saving = false
  let loadError = ``
  let content = ``
  let scope: PlayerNoteScope = `admins`
  let editingNoteId: number | null = null
  let editContent = ``
  let editScope: PlayerNoteScope = `admins`
  let activeUser = $authState.user
  let sessionRevision = 1
  let contextKey = ``
  let referenceRevision = 0
  let previousAdding = adding
  let appliedSeedKey = ``
  let now = new Date()

  const controller = createPlayerNotesController({
    list: fetchAllPlayerNotes,
    create: createPlayerNote,
    update: updatePlayerNote,
    onChange: state => {
      notes = state.notes
      onNoteCountChange(state.noteCount)
      loading = state.loading
      saving = state.saving
      loadError = state.error ?? ``
    },
  })

  $: valid = isPlayerNoteValid(content)
  $: editValid = isPlayerNoteValid(editContent)
  $: contentLength = content.trim().length
  $: editContentLength = editContent.trim().length
  $: editorActions = uniqueById([...referenceActions, ...notes.flatMap(note => note.actionReferences)])
  $: editorUsers = uniqueById([...referenceUsers, ...notes.flatMap(note => note.userReferences)])
  $: if (actions !== referenceActions && actions.length > 0) referenceActions = actions
  $: if ($authState.user !== activeUser) {
    activeUser = $authState.user
    sessionRevision += 1
    contextKey = ``
  }
  $: nextContextKey = `${playerId}:${sessionRevision}:${activeUser?.id ?? 0}`
  $: if (nextContextKey !== contextKey) {
    contextKey = nextContextKey
    cancelEdit()
    resetComposer(false)
    void controller.select(activeUser ? { playerId, sessionRevision } : null)
    void loadReferences()
  }
  $: if (adding !== previousAdding) {
    previousAdding = adding
    if (!adding) appliedSeedKey = ``
  }
  $: nextSeedKey = adding && seedActionId ? `${contextKey}:${seedActionId}` : ``
  $: if (nextSeedKey && nextSeedKey !== appliedSeedKey) {
    appliedSeedKey = nextSeedKey
    const composer = createPlayerNoteComposer(true, seedActionId ?? undefined)
    content = composer.content
    scope = composer.scope
  }

  onMount(() => {
    void loadReferences()
    const relativeTimeTimer = window.setInterval(() => (now = new Date()), 60_000)
    return () => window.clearInterval(relativeTimeTimer)
  })
  onDestroy(() => controller.destroy())

  async function loadReferences(): Promise<void> {
    const revision = ++referenceRevision
    const selectedPlayerId = playerId
    try {
      const [nextActions, nextUsers] = await Promise.all([
        actions.length ? Promise.resolve(actions) : fetchAllPlayerActions(selectedPlayerId),
        referenceUsers.length ? Promise.resolve(referenceUsers) : fetchAllUserReferences(),
      ])
      if (revision !== referenceRevision || selectedPlayerId !== playerId) return
      referenceActions = nextActions
      referenceUsers = nextUsers
    } catch (error) {
      console.error(`[PlayerNotes] Reference data failed:`, error)
    }
  }

  async function submit(): Promise<void> {
    if (!valid || saving) return
    const selectedContext = contextKey
    const saved = await controller.create(content, scope)
    if (saved && selectedContext === contextKey) {
      resetComposer(false)
      notifySuccess(`Note added.`)
    } else if (selectedContext === contextKey && loadError) {
      notifyError(loadError)
    }
  }

  function edit(note: PlayerNote): void {
    editingNoteId = note.id
    editContent = note.content
    editScope = note.scope
  }

  async function submitEdit(note: PlayerNote): Promise<void> {
    if (!editValid || saving || editingNoteId !== note.id) return
    const selectedContext = contextKey
    const saved = await controller.update(note.id, { content: editContent, scope: editScope })
    if (saved && selectedContext === contextKey) {
      cancelEdit()
      notifySuccess(`Note updated.`)
    } else if (selectedContext === contextKey && loadError) {
      notifyError(loadError)
    }
  }

  function resetComposer(nextAdding = adding): void {
    adding = nextAdding
    content = ``
    scope = `admins`
    if (!nextAdding) appliedSeedKey = ``
  }

  function cancelEdit(): void {
    editingNoteId = null
    editContent = ``
    editScope = `admins`
  }

  const author = (note: PlayerNote) => note.author.username?.trim() || note.author.playfabId?.trim() || `#${note.author.id}`
  const scopeLabel = (value: PlayerNoteScope) => SCOPE_OPTIONS.find(option => option.value === value)?.label ?? value
  const canEdit = (note: PlayerNote) => activeUser ? canEditPlayerNote(note, activeUser) : false
  const uniqueById = <T extends { id: number }>(items: T[]) => [...new Map(items.map(item => [item.id, item])).values()]
</script>

<section class="player-notes" aria-label="Player notes">
  <PanelHeader variant="section" title="Notes" help="Player notes with references to recorded actions and admins." />

  {#if adding}
    <form class="player-notes__form" on:submit|preventDefault={() => void submit()}>
      <span>Note</span>
      <PlayerNoteEditor
        {playerId}
        actions={editorActions}
        users={editorUsers}
        {content}
        disabled={saving}
        onChange={value => (content = value)}
        onOpenAction={id => editorActions.find(action => action.id === id) && onOpenAction(editorActions.find(action => action.id === id)!)}
        onOpenUser={id => editorUsers.find(user => user.id === id) && onOpenUser(editorUsers.find(user => user.id === id)!)}
      />
      <small class:player-notes__count--invalid={contentLength > 1000}>{contentLength}/1000 characters</small>
      <Select label="Visibility" options={SCOPE_OPTIONS} value={scope} onChange={value => (scope = value as PlayerNoteScope)} />
      <div class="player-notes__form-actions">
        <button type="button" on:click={() => resetComposer(false)}>Cancel</button>
        <button class="player-notes__submit" type="submit" disabled={!valid || saving}>{saving ? "Saving..." : "Save note"}</button>
      </div>
    </form>
  {/if}

  <div class="player-notes__list" aria-live="polite">
    {#if loadError && notes.length > 0}
      <div class="player-notes__empty" role="alert"><p>{loadError}</p><Button label="Retry refresh" icon="fa-rotate-right" onClick={() => void controller.refresh()} /></div>
    {/if}
    {#if loading && notes.length === 0}
      <p class="player-notes__empty">Loading notes...</p>
    {:else if loadError && notes.length === 0}
      <div class="player-notes__empty"><p>{loadError}</p><Button label="Retry" icon="fa-rotate-right" onClick={() => void controller.refresh()} /></div>
    {:else}
      {#each notes as note (note.id)}
        <article class="player-notes__note">
          {#if editingNoteId === note.id}
            <form class="player-notes__form" on:submit|preventDefault={() => void submitEdit(note)}>
              <PlayerNoteEditor
                {playerId}
                actions={editorActions}
                users={editorUsers}
                content={editContent}
                disabled={saving}
                onChange={value => (editContent = value)}
                onOpenAction={id => editorActions.find(action => action.id === id) && onOpenAction(editorActions.find(action => action.id === id)!)}
                onOpenUser={id => editorUsers.find(user => user.id === id) && onOpenUser(editorUsers.find(user => user.id === id)!)}
              />
              <small class:player-notes__count--invalid={editContentLength > 1000}>{editContentLength}/1000 characters</small>
              <Select label="Visibility" options={SCOPE_OPTIONS} value={editScope} onChange={value => (editScope = value as PlayerNoteScope)} />
              <div class="player-notes__form-actions">
                <button type="button" on:click={cancelEdit}>Cancel</button>
                <button class="player-notes__submit" type="submit" disabled={!editValid || saving}>{saving ? "Saving..." : "Save note"}</button>
              </div>
            </form>
          {:else}
            <PlayerNoteContent {note} {onOpenAction} {onOpenUser} />
            <div class="player-notes__meta-row">
              <small class="player-notes__meta">
                <span>{author(note)}</span>
                <span aria-hidden="true">·</span>
                <span>{scopeLabel(note.scope)}</span>
                <span aria-hidden="true">·</span>
                <time datetime={note.createdAt} use:tooltipAction={formatFullDateTime(note.createdAt)}>{formatRelativeDateTime(note.createdAt, now)}</time>
              </small>
              {#if canEdit(note)}<button class="player-notes__edit" type="button" on:click={() => edit(note)}>Edit</button>{/if}
            </div>
          {/if}
        </article>
      {:else}
        <p class="player-notes__empty">No notes have been added.</p>
      {/each}
    {/if}
  </div>
</section>

<style lang="scss">
  .player-notes, .player-notes__list, .player-notes__form, .player-notes__note, .player-notes__empty { display: grid; gap: var(--gutter-sm); }
  .player-notes { gap: var(--gutter-md); }
  .player-notes__form, .player-notes__note, .player-notes__empty { border: 1px solid var(--color-dark-secondary); border-radius: var(--radius); padding: var(--gutter-md); background: rgba(3, 12, 18, 0.52); }
  .player-notes__form > small { color: var(--color-light-tertiary); font-size: var(--font-size-xs); }
  .player-notes__meta-row { display: flex; align-items: center; justify-content: space-between; gap: var(--gutter-md); }
  .player-notes__meta { display: flex; align-items: center; flex-wrap: wrap; gap: 0.25rem; color: var(--color-light-tertiary); font-size: var(--font-size-xs); }
  .player-notes__form-actions { display: flex; justify-content: flex-end; gap: var(--gutter-sm); }
  .player-notes__form-actions button, .player-notes__edit { border: 1px solid var(--color-dark-secondary); border-radius: var(--radius); padding: 0.45rem 0.75rem; background: transparent; color: var(--color-light-primary); }
  .player-notes__submit { border-color: var(--color-accent-primary) !important; background: rgbaa(var(--color-accent-primary), 0.14) !important; }
  .player-notes__edit { justify-self: end; }
  .player-notes__count--invalid { color: var(--color-accent-quaternary) !important; }
  p { margin: 0; }
</style>
