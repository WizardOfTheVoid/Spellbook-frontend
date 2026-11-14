import { writable } from 'svelte/store'
import type { MaintenanceApi, MaintenanceRuntimeState } from '../../../../shared/maintenance'

export function canUseMaintenanceAdmin(user: { isActive: boolean, isSuperadmin: boolean } | null): boolean {
  return user?.isActive === true && user.isSuperadmin
}

export function createMaintenanceSession() {
  const state = writable<MaintenanceRuntimeState>({ maintenance: null, databaseReady: false, initialized: false, error: null })
  let generation = 0
  let epoch = 0
  let enabled = false
  function publish(value: MaintenanceRuntimeState): void {
    if (value.maintenance?.enabled && !enabled) epoch += 1
    enabled = value.maintenance?.enabled === true
    state.set(value)
  }
  return {
    subscribe: state.subscribe,
    epoch: () => epoch,
    start(api: Pick<MaintenanceApi, `snapshot` | `subscribe`>): () => void {
      const request = ++generation
      let changed = false
      const stop = api.subscribe(value => {
        if (request !== generation) return
        changed = true
        publish(value)
      })
      void api.snapshot().then(value => {
        if (request === generation && !changed) publish(value)
      }).catch(error => {
        if (request === generation && !changed) state.update(value => ({ ...value, error: error instanceof Error ? error.message : `Could not check maintenance status.` }))
      })
      return () => {
        if (request === generation) generation += 1
        stop()
      }
    }
  }
}

export const maintenanceSession = createMaintenanceSession()
export const maintenanceAdminOpen = writable(false)
