import { get, writable } from 'svelte/store'
import type { CoreCallResult } from '$lib/core'
import { unwrap } from '$lib/utils/apiResult'

export function createTeamEditor<T>(load: () => Promise<CoreCallResult>, save: (value: T) => Promise<CoreCallResult>) {
  const state = writable<{ value: T | null, saved: string, busy: boolean, error: string }>({ value: null, saved: ``, busy: false, error: `` })
  let revision = 0
  let disposed = false
  const dirty = () => {
    const current = get(state)
    return current.value !== null && JSON.stringify(current.value) !== current.saved
  }
  async function request(saving: boolean): Promise<boolean> {
    if (get(state).busy || disposed) return false
    const current = get(state).value
    if (saving && current === null) return false
    const version = ++revision
    state.update(value => ({ ...value, busy: true, error: `` }))
    try {
      const value = await unwrap<T>(saving ? await save(current as T) : await load(), `Team request failed.`)
      if (disposed || version !== revision) return false
      state.set({ value, saved: JSON.stringify(value), busy: false, error: `` })
      return true
    } catch (error) {
      if (!disposed && version === revision) state.update(value => ({ ...value, busy: false, error: error instanceof Error ? error.message : `Team request failed.` }))
      return false
    }
  }
  return { subscribe: state.subscribe, dirty, load: () => request(false), save: () => request(true),
    change: (patch: Partial<T>) => state.update(current => current.value && !current.busy ? { ...current, value: { ...current.value, ...patch } } : current),
    dispose: () => {
      disposed = true
      revision += 1
    } }
}
