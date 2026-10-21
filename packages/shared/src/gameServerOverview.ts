export const serverHistoryPeriods = { day: 24, week: 24 * 7, month: 24 * 30 } as const
export type ServerHistoryPeriod = keyof typeof serverHistoryPeriods

export function parseServerHistoryPeriod(value: unknown): ServerHistoryPeriod {
  if (value === undefined) return `day`
  if (typeof value !== `string` || !Object.hasOwn(serverHistoryPeriods, value)) throw new Error(`Invalid server history period.`)
  return value as ServerHistoryPeriod
}

export type ServerOwnerTeam = { id: number, name: string, tag: string, logo: string | null }
export type ServerAdmin = { id: string, name: string, avatar: string | null }
export type ServerAdmins = { total: number, items: ServerAdmin[], offset: number, hasMore: boolean }
export type ServerPopulationHistory = {
  start: string
  end: string
  intervalMs: number
  average: number | null
  coveredMs: number
  buckets: { at: string, value: number | null }[]
}
export type GameServerOverview = {
  gameServerId: number
  period: ServerHistoryPeriod
  generatedAt: string
  population: ServerPopulationHistory
  moderation: { bans: number, kicks: number, warnings: number, unbans: number }
  admins: ServerAdmins
}
