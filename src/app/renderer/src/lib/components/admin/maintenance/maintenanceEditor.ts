import { get, writable } from 'svelte/store'
import { maintenanceDefaults, validateMaintenanceInput, type MaintenanceAdminState, type MaintenanceInput } from '@spellbook/shared/maintenance'
import type { MaintenanceApi } from '../../../../../../shared/maintenance'

type EditorState = {
  saved: MaintenanceAdminState | null
  draft: MaintenanceInput
  loading: boolean
  saving: boolean
  conflict: boolean
  error: string | null
}

export function createMaintenanceEditor(api: Pick<MaintenanceApi, `admin` | `update`>) {
  const state = writable<EditorState>({ saved: null, draft: { ...maintenanceDefaults }, loading: false, saving: false, conflict: false, error: null })
  let edits = 0
  let generation = 0
  const dirty = () => {
    const { saved, draft } = get(state)
    return saved !== null && ([`enabled`, `title`, `text`] as const).some(key => draft[key] !== saved[key])
  }
  async function load(discard = false): Promise<void> {
    if (get(state).loading || get(state).saving) return
    const request = ++generation
    const edit = edits
    const preserve = !discard && dirty()
    state.update(value => ({ ...value, loading: true, error: null }))
    try {
      const saved = await api.admin()
      if (request !== generation) return
      state.update(value => ({ ...value, saved, draft: preserve || edit !== edits ? value.draft : copy(saved), conflict: discard ? false : value.conflict }))
    } catch (error) {
      if (request === generation) state.update(value => ({ ...value, error: message(error) }))
    } finally {
      if (request === generation) state.update(value => ({ ...value, loading: false }))
    }
  }
  return {
    subscribe: state.subscribe, dirty, load,
    edit(patch: Partial<MaintenanceInput>) {
      edits += 1
      state.update(value => ({ ...value, draft: { ...value.draft, ...patch } }))
    },
    async save(enabled = get(state).draft.enabled): Promise<boolean> {
      const current = get(state)
      if (!current.saved || current.saving || current.loading || current.conflict) return false
      const edit = edits
      const request = ++generation
      state.update(value => ({ ...value, saving: true, error: null }))
      try {
        const input = validateMaintenanceInput({ ...current.draft, enabled })
        const saved = await api.update({ ...input, expectedRevision: current.saved.revision })
        if (request !== generation) return false
        state.update(value => ({ ...value, saved, draft: edits === edit ? copy(saved) : value.draft, conflict: false }))
        return true
      } catch (error) {
        if (request !== generation) return false
        const conflict = typeof error === `object` && error !== null && (`code` in error && error.code === `MAINTENANCE_CONFLICT` || `statusCode` in error && error.statusCode === 409)
        state.update(value => ({ ...value, error: message(error), conflict }))
        if (conflict) {
          try {
            const saved = await api.admin()
            if (request === generation) state.update(value => ({ ...value, saved }))
          } catch { /* Keep the dirty draft and conflict until an explicit reload succeeds. */ }
        }
        return false
      } finally {
        if (request === generation) state.update(value => ({ ...value, saving: false }))
      }
    },
    destroy() { generation += 1 }
  }
}

function copy(value: MaintenanceInput): MaintenanceInput {
  return { enabled: value.enabled, title: value.title, text: value.text }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : `Maintenance settings could not be saved.`
}
