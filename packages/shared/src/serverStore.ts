export type LiveSource = `listplayers` | `a2s` | `directory`
export type LiveFreshness = { observedAt: string | null, expiresAt: string | null, fresh: boolean }
export type LivePopulation = { count: number | null, source: LiveSource | null, observedAt: string | null }
export type LivePlayer = {
  key: string
  playerId: number | null
  playfabId: string | null
  name: string
  identity: `listplayers` | `inferred` | `unknown`
  durationSeconds: number | null
  durationObservedAt: string | null
  pingMs: number | null
  bot: boolean
  index?: number
  eosPlayerId?: string | null
  score?: number | null
  kills?: number | null
  deaths?: number | null
}
export type ServerLiveSummary = {
  gameServerId: number
  epoch: string
  revision: number
  endpointGeneration: number
  serverTime: string
  population: LivePopulation
  sources: Record<LiveSource, LiveFreshness>
  ping: number | null
  password: boolean | null
  maxPlayers: number | null
  botCount: number | null
}
export type ServerLiveRoster = ServerLiveSummary & {
  source: `listplayers` | `a2s` | null
  status: `fresh` | `stale` | `unavailable`
  players: LivePlayer[]
  bots: LivePlayer[]
}
export type CurrentServerConnection = {
  clientId: string
  sequence: number
  generation: number
  gameServerId: number | null
}
