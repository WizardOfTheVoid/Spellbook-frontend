export type MaintenanceInput = { enabled: boolean, title: string, text: string }
export type MaintenanceState = MaintenanceInput & { revision: number }
export type MaintenanceStatus = { maintenance: MaintenanceState | null, databaseReady: boolean }
export type MaintenanceAdminState = MaintenanceState & { updatedAt: string, updatedBy: number | null }
export type MaintenanceUpdate = MaintenanceInput & { expectedRevision: number }

export const maintenanceDefaults: MaintenanceInput = {
  enabled: false, title: `Maintenance`, text: `SpellBook is temporarily unavailable. Please try again shortly.`
}

export function validateMaintenanceInput(value: unknown): MaintenanceInput {
  if (!value || typeof value !== `object`) throw new Error(`Maintenance settings are required.`)
  const input = value as Record<string, unknown>
  if (typeof input.enabled !== `boolean`) throw new Error(`Enabled must be a boolean.`)
  for (const [field, limit] of [[`title`, 120], [`text`, 2000]] as const) {
    const copy = input[field]
    if (typeof copy !== `string` || !copy.trim() || [...copy].length > limit) {
      throw new Error(`${field} must contain 1 to ${limit} Unicode characters.`)
    }
  }
  return { enabled: input.enabled, title: input.title as string, text: input.text as string }
}

export function maintenanceMessage(state: MaintenanceInput): string {
  return `${state.title}\n\n${state.text}`
}
