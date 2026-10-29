import type { MaintenanceAdminState, MaintenanceUpdate } from '@spellbook/shared/maintenance'
import type { MaintenanceApi, MaintenanceRuntimeState } from '../shared/maintenance'
import type { RuntimeIpcRenderer } from './coreBridge'

export function createMaintenanceBridge(ipc: RuntimeIpcRenderer): MaintenanceApi {
  async function invoke<T>(operation: string, input?: unknown): Promise<T> {
    const result = await ipc.invoke(`maintenance:${operation}`, input) as { ok: boolean, data: T, error?: { code: string, message: string } }
    if (!result.ok) throw Object.assign(new Error(result.error?.message ?? `Maintenance request failed.`), { code: result.error?.code })
    return result.data
  }
  return {
    snapshot: () => invoke<MaintenanceRuntimeState>(`snapshot`),
    refresh: () => invoke<MaintenanceRuntimeState>(`refresh`),
    admin: () => invoke<MaintenanceAdminState>(`admin`),
    update: (input: MaintenanceUpdate) => invoke<MaintenanceAdminState>(`update`, input),
    subscribe: callback => {
      const listener = (_event: unknown, state: unknown) => callback(state as MaintenanceRuntimeState)
      ipc.on(`maintenance:changed`, listener)
      return () => ipc.removeListener(`maintenance:changed`, listener)
    }
  }
}
