export type PlayerPresence = {
  isOnline: boolean
  observedAt: string | null
  expiresAt?: string | null
  identity?: `listplayers` | `inferred` | `unknown`
  serverTime?: string
  durationSeconds?: number | null
  server: {
    id: number
    name: string
    durationSeconds: number | null
    durationObservedAt: string | null
  } | null
}
