import type { IpcMain } from 'electron'
import type { MaintenanceAdminState, MaintenanceStatus, MaintenanceUpdate } from '@spellbook/shared/maintenance'
import { readMaintenanceState } from '../../shared/maintenance'
import type { HttpClient } from '../api/http-client'
import type { CoreCallResult } from '../types'
import type { OverlayWindowController } from '../window/overlay-window-controller'
import type { MaintenanceMonitor } from './maintenanceMonitor'

export function maintenanceData<T>(result: CoreCallResult): T {
  const envelope = result.data as { ok?: boolean, data?: T, error?: { code?: string, message?: string } } | null
  if (!result.ok || envelope?.ok !== true || !envelope.data) {
    const error = envelope?.error ?? result.error
    throw Object.assign(new Error(error?.message ?? `Maintenance status unavailable.`), { code: error?.code ?? `SERVER_UNAVAILABLE` })
  }
  return envelope.data
}

export async function readMaintenanceStatus(http: Pick<HttpClient, `getServer`>, signal: AbortSignal): Promise<MaintenanceStatus> {
  const data = maintenanceData<MaintenanceStatus>(await http.getServer(`/system/maintenance`, {}, signal))
  const state = readMaintenanceState(data.maintenance)
  if (typeof data.databaseReady !== `boolean` || (data.maintenance !== null && !state)) throw new Error(`Invalid maintenance status.`)
  return { maintenance: state, databaseReady: data.databaseReady }
}

export class MaintenanceIpc {
  constructor(
    private readonly ipc: Pick<IpcMain, `handle`>,
    private readonly monitor: MaintenanceMonitor,
    private readonly http: Pick<HttpClient, `getServer` | `patchServer`>,
    private readonly window: Pick<OverlayWindowController, `getCurrent` | `sendToCurrent`>
  ) {}

  register(): void {
    const operations = {
      snapshot: () => this.monitor.snapshot(),
      refresh: () => this.monitor.refresh(),
      admin: async () => maintenanceData<MaintenanceAdminState>(await this.http.getServer(`/admin/maintenance`)),
      update: async (input: MaintenanceUpdate) => {
        const saved = maintenanceData<MaintenanceAdminState>(await this.http.patchServer(`/admin/maintenance`, input))
        await this.monitor.acceptSaved(saved)
        return saved
      }
    }
    for (const [name, run] of Object.entries(operations)) {
      this.ipc.handle(`maintenance:${name}`, async (event, input: MaintenanceUpdate) => {
        if (event.sender !== this.window.getCurrent()?.webContents || !event.senderFrame || event.senderFrame !== event.sender.mainFrame) {
          throw new Error(`Maintenance settings are only available in the main SpellBook window.`)
        }
        try { return { ok: true, data: await run(input) } }
        catch (error) {
          return { ok: false, error: { code: (error as { code?: string }).code ?? `SERVER_UNAVAILABLE`, message: error instanceof Error ? error.message : `Maintenance request failed.` } }
        }
      })
    }
    this.monitor.subscribe(state => this.window.sendToCurrent(`maintenance:changed`, state))
  }
}
