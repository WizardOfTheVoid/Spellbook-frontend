export type ForensicsTab = `ping` | `triangulate` | `friends` | `rhythm`

export function normalizeForensicsTab(value: unknown): ForensicsTab {
  return value === `triangulate` || value === `friends` || value === `rhythm` ? value : `ping`
}
