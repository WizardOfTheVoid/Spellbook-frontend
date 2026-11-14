export const playerActionSnapshotLifetimeMs = 60_000

export function isPlayerActionSnapshotFresh(observedAt: string, now = Date.now()): boolean {
  const age = now - Date.parse(observedAt)
  return age >= 0 && age < playerActionSnapshotLifetimeMs
}
