export type PlayerPresence = {
  isOnline: boolean
  observedAt: string | null
  durationSeconds?: number | null
  server: {
    id: number
    name: string
    durationSeconds: number | null
    durationObservedAt: string | null
  } | null
}
