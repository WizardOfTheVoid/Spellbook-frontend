import { writable } from 'svelte/store'
import type { PlayerAction } from '$lib/core'
import type { FormOption } from '$lib/types/ui'
import { actionLabel, actionServer } from '$lib/utils/playerActions'

type OffenseEditorState = {
  actions: PlayerAction[]
  offenseIds: number[]
  loading: boolean
  saving: boolean
  dirty: boolean
  error: string | null
}

type OffenseEditorDependencies = {
  load(playerId: number): Promise<PlayerAction[]>
  save(id: number, offenseIds: number[]): Promise<{ offenseIds: number[] }>
  onSaved?(offenseIds: number[]): void
}

const uniqueIds = (ids: number[]) => [...new Set(ids)]
const sameIds = (left: number[], right: number[]) => left.length === right.length && left.every(id => right.includes(id))

export function evidenceOffenseOptions(actions: PlayerAction[], playerId: number, selectedIds: number[]): FormOption[] {
  const eligible = actions.filter(action => action.playerId === playerId && !action.removedAt && [`ban`, `kick`, `warn`].includes(action.actionType))
  return [
    ...eligible.map(action => ({ value: `${action.id}`, label: `${actionLabel(action)} · ${actionServer(action)} · #${action.id}` })),
    ...selectedIds.filter(id => !eligible.some(action => action.id === id)).map(id => ({
      value: `${id}`, label: `Offense #${id}`, description: `This linked offense is unavailable. Remove it to unlink it.`
    }))
  ]
}

export function createEvidenceOffenseEditor(evidence: { id: number, playerId: number, offenseIds?: number[] }, deps: OffenseEditorDependencies) {
  let savedIds = uniqueIds(evidence.offenseIds ?? [])
  let current: OffenseEditorState = { actions: [], offenseIds: savedIds, loading: true, saving: false, dirty: false, error: null }
  const state = writable(current)
  let disposed = false
  let loadRevision = 0
  const change = (patch: Partial<OffenseEditorState>) => {
    current = { ...current, ...patch }
    state.set(current)
  }

  async function load(): Promise<void> {
    if (disposed) return
    const revision = ++loadRevision
    change({ loading: true, error: null })
    try {
      const actions = await deps.load(evidence.playerId)
      if (!disposed && revision === loadRevision) change({ actions })
    } catch (cause) {
      if (!disposed && revision === loadRevision) change({ error: cause instanceof Error ? cause.message : `Offenses could not be loaded.` })
    } finally {
      if (!disposed && revision === loadRevision) change({ loading: false })
    }
  }

  function setIds(ids: number[]): void {
    if (disposed || current.loading || current.saving) return
    const offenseIds = uniqueIds(ids)
    change({ offenseIds, dirty: !sameIds(offenseIds, savedIds), error: null })
  }

  function syncIds(ids: number[]): void {
    if (disposed || current.dirty || current.saving) return
    savedIds = uniqueIds(ids)
    if (!sameIds(savedIds, current.offenseIds)) change({ offenseIds: savedIds })
  }

  async function save(): Promise<void> {
    if (disposed || current.loading || current.saving || !current.dirty) return
    const offenseIds = [...current.offenseIds]
    change({ saving: true, error: null })
    try {
      const saved = await deps.save(evidence.id, offenseIds)
      if (disposed) return
      savedIds = uniqueIds(saved.offenseIds)
      change({ offenseIds: savedIds, dirty: false })
      deps.onSaved?.(savedIds)
    } catch (cause) {
      if (!disposed) change({ error: cause instanceof Error ? cause.message : `Evidence offenses could not be saved.` })
    } finally {
      if (!disposed) change({ saving: false })
    }
  }

  return { subscribe: state.subscribe, load, setIds, syncIds, save, dispose: () => { disposed = true } }
}
