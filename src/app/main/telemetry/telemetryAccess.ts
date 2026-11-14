export type TelemetryAccess = Readonly<{ userId: number | null; allowed: boolean }>
export const noTelemetryAccess: TelemetryAccess = Object.freeze({ userId: null, allowed: false })

export function requireTelemetryAccess(access: TelemetryAccess): number {
  if (
    !access.allowed ||
    !Number.isSafeInteger(access.userId) ||
    !access.userId ||
    access.userId < 1
  )
    throw new Error(`Telemetry is available to signed-in superadmins`)
  return access.userId
}
