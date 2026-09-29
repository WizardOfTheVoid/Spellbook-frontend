export type GameServerA2sData = {
  status: `fresh` | `stale` | `unavailable`
  observedAt: string | null
  ageSeconds: number | null
  ping: number | null
  password: boolean | null
  identity: `inferred`
  players: Array<{ playerId: number, name: string | null }>
}
