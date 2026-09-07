import type { PlayerNote, PlayerNoteMutation, PlayerNoteScope, PlayerNoteUpdateInput } from '$lib/core'

export type PlayerNoteComposer = {
  adding: boolean
  content: string
  scope: PlayerNoteScope
}

export const createPlayerNoteComposer = (adding = false, actionId?: number): PlayerNoteComposer => ({
  adding,
  content: actionId ? `#[action:${actionId}] ` : ``,
  scope: `admins`,
})

export const resetPlayerNoteComposer = (
  current: PlayerNoteComposer,
  adding = current.adding,
): PlayerNoteComposer => createPlayerNoteComposer(adding)

export const isPlayerNoteValid = (content: string): boolean => {
  const length = content.trim().length
  return length >= 1 && length <= 1000
}

export const sortPlayerNotes = (notes: readonly PlayerNote[]): PlayerNote[] => [...notes].sort((left, right) => {
  const difference = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  return difference || right.id - left.id
})

export const canEditPlayerNote = (
  note: PlayerNote,
  viewer: { id: number, isSuperadmin: boolean },
): boolean => note.author.id === viewer.id || (viewer.isSuperadmin && note.scope !== `me`)

export type PlayerNotesContext = { playerId: number, sessionRevision: number }
export type PlayerNotesState = { notes: PlayerNote[], noteCount: number, loading: boolean, saving: boolean, error: string | null }

type PlayerNotesDependencies = {
  list: (playerId: number) => Promise<PlayerNote[]>
  create: (playerId: number, content: string, scope: PlayerNoteScope) => Promise<PlayerNoteMutation>
  update: (playerId: number, noteId: number, input: PlayerNoteUpdateInput) => Promise<PlayerNoteMutation>
  onChange?: (state: PlayerNotesState) => void
}

export function createPlayerNotesController(dependencies: PlayerNotesDependencies) {
  let context: PlayerNotesContext | null = null
  let contextRevision = 0
  let requestRevision = 0
  let destroyed = false
  let state = emptyState()

  const emit = () => dependencies.onChange?.({ ...state, notes: [...state.notes] })
  const current = (contextVersion: number, requestVersion: number) =>
    !destroyed && contextRevision === contextVersion && requestRevision === requestVersion

  async function load(): Promise<boolean> {
    if (!context || destroyed) return false
    const selected = context
    const contextVersion = contextRevision
    const requestVersion = ++requestRevision
    state = { ...state, loading: true, error: null }
    emit()
    try {
      const notes = sortPlayerNotes(await dependencies.list(selected.playerId))
      if (!current(contextVersion, requestVersion)) return false
      state = { ...state, notes, noteCount: notes.length, loading: false, error: null }
      emit()
      return true
    } catch (error) {
      if (!current(contextVersion, requestVersion)) return false
      state = { ...state, loading: false, error: message(error, `Player notes failed to load.`) }
      emit()
      return false
    }
  }

  async function mutate(operation: (selected: PlayerNotesContext) => Promise<PlayerNoteMutation>): Promise<boolean> {
    if (!context || state.saving || destroyed) return false
    const selected = context
    const contextVersion = contextRevision
    requestRevision += 1
    state = { ...state, saving: true, error: null }
    emit()
    try {
      const mutation = await operation(selected)
      if (destroyed || contextRevision !== contextVersion) return false
      state = { ...state, noteCount: mutation.noteCount }
      emit()
      await load()
      if (destroyed || contextRevision !== contextVersion) return false
      state = { ...state, saving: false }
      emit()
      return true
    } catch (error) {
      if (destroyed || contextRevision !== contextVersion) return false
      state = { ...state, saving: false, error: message(error, `Player note update failed.`) }
      emit()
      return false
    }
  }

  return {
    async select(next: PlayerNotesContext | null): Promise<void> {
      if (sameContext(context, next)) return
      context = next
      contextRevision += 1
      requestRevision += 1
      state = emptyState()
      emit()
      if (next) await load()
    },
    refresh: load,
    create: async (content: string, scope: PlayerNoteScope) =>
      await mutate(selected => dependencies.create(selected.playerId, content, scope)),
    update: async (noteId: number, input: PlayerNoteUpdateInput) =>
      await mutate(selected => dependencies.update(selected.playerId, noteId, input)),
    snapshot: (): PlayerNotesState => ({ ...state, notes: [...state.notes] }),
    destroy(): void {
      destroyed = true
      contextRevision += 1
      requestRevision += 1
    },
  }
}

const emptyState = (): PlayerNotesState => ({ notes: [], noteCount: 0, loading: false, saving: false, error: null })
const sameContext = (left: PlayerNotesContext | null, right: PlayerNotesContext | null) =>
  left?.playerId === right?.playerId && left?.sessionRevision === right?.sessionRevision
const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback
