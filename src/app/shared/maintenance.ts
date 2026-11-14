import type { MaintenanceAdminState, MaintenanceState, MaintenanceStatus, MaintenanceUpdate } from '@spellbook/shared/maintenance'

export type MaintenanceRuntimeState = MaintenanceStatus & { initialized: boolean, error: string | null }

export type MaintenanceApi = {
  snapshot(): Promise<MaintenanceRuntimeState>
  refresh(): Promise<MaintenanceRuntimeState>
  admin(): Promise<MaintenanceAdminState>
  update(input: MaintenanceUpdate): Promise<MaintenanceAdminState>
  subscribe(listener: (state: MaintenanceRuntimeState) => void): () => void
}

export function maintenanceOperational(state: MaintenanceRuntimeState): boolean {
  return state.initialized && state.maintenance?.enabled !== true
}

export function normalizeMaintenanceBaseUrl(value: string): string {
  const url = new URL(value)
  url.hash = ``
  url.search = ``
  url.pathname = url.pathname.replace(/\/+$/u, ``)
  return url.toString().replace(/\/$/u, ``)
}

export function readMaintenanceState(value: unknown): MaintenanceState | null {
  if (!value || typeof value !== `object`) return null
  const state = value as Partial<MaintenanceState>
  return typeof state.enabled === `boolean` && typeof state.title === `string` && typeof state.text === `string`
    && Number.isSafeInteger(state.revision) && state.revision! >= 0
    ? { enabled: state.enabled, title: state.title, text: state.text, revision: state.revision! } : null
}
