export type PlayerSearchIndexStatus = {
  state: `idle` | `backfilling` | `ready` | `failed` | `unavailable`
  processedPlayers: number
  processedAliases: number
  startedAt: string | null
  finishedAt: string | null
  error: string | null
  canRebuild: boolean
}
