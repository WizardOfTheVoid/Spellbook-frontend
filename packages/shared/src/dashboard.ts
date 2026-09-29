export type DashboardEnvironment = `global` | `team` | `you`
export type DashboardPeriod = `allTime` | `30Days` | `1Week` | `24Hours` | `lastHour`
export type DashboardTimelineView = `playerActions` | `protectedServers` | `topAdmins` | `topTeams`
export type DashboardRankingKind = `admins` | `teams` | `active`
export type DashboardViewQuery = Readonly<{ environment: DashboardEnvironment, period: DashboardPeriod, timeline: DashboardTimelineView }>
export type DashboardEntity = Readonly<{ id: string, name: string, avatar: string | null }>
export type DashboardRank = DashboardEntity & Readonly<{ rank: number, count: number }>
export type DashboardTimelineSeries = Readonly<{ id: string, label: string, color?: string, values: readonly (number | null)[] }>
export type DashboardTimeRange = Readonly<{ start: number, end: number }>
export type DashboardTimelineData = Readonly<{ buckets: readonly string[], series: readonly DashboardTimelineSeries[], range?: DashboardTimeRange, intervalMs?: number }>
export type DashboardTimelineQuery = Readonly<{ query: DashboardViewQuery, range: DashboardTimeRange, maxBuckets?: number }>
export type DashboardActionTotals = Readonly<{ bans: number | null, kicks: number | null, warnings: number | null, unbans: number | null, serversay: number | null, adminsay: number | null }>
export type DashboardViewModel = Readonly<{
  query: DashboardViewQuery
  generatedAt: string
  viewerId: string
  teams: readonly DashboardEntity[]
  live: Readonly<{ admins: number, servers: number, players: number, playerServers: number, gamePlayers: number, avatars: readonly DashboardEntity[], latest: { actor: DashboardEntity, verb: string, server: DashboardEntity | null, at: string } | null }>
  scoreboards: Readonly<{ admins: readonly DashboardRank[], teams: readonly DashboardRank[], active: readonly DashboardRank[], viewerRank: Partial<Record<DashboardRankingKind, DashboardRank>>, protection: { server: DashboardEntity, team: DashboardEntity | null, members: number, actions: number, activity: readonly number[] } | null }>
  metrics: Readonly<{ accounts: number | null, money: number | null, cheaterBans: number | null, wantedBans: number | null, applications: number | null, actions: number | null, contribution: number | null, servers: number | null, moneySeries: readonly number[] }>
  breakdown: DashboardActionTotals
  timeline: DashboardTimelineData
  coverage: `complete` | `partial` | `unavailable`
}>
export type DashboardLeaderboardQuery = Readonly<{ kind: DashboardRankingKind, page: number, pageSize: number, asOf: string | null }>
export type DashboardLeaderboardPage = Readonly<{ rows: readonly DashboardRank[], total: number, page: number, pageSize: number, asOf: string }>
export type DashboardSnapshot = DashboardViewModel & Readonly<{ schemaVersion: 2, coverageDetails: { players: DashboardViewModel[`coverage`], messages: DashboardViewModel[`coverage`], since: string | null } }>
export type DashboardQuery = DashboardViewQuery
export type DashboardPresenceInput = Readonly<{ instanceId: string, sequence: number, gameServerId: number | null }>

const environments = [`global`, `team`, `you`] as const
const periods = [`allTime`, `30Days`, `1Week`, `24Hours`, `lastHour`] as const
const timelines = [`playerActions`, `protectedServers`, `topAdmins`, `topTeams`] as const

export function dashboardRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== `object` || Array.isArray(value)) throw new RangeError(`Expected an object.`)
  return value as Record<string, unknown>
}

function option<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  if (value === undefined) return fallback
  if (typeof value !== `string` || !options.includes(value as T)) throw new RangeError(`Invalid dashboard option.`)
  return value as T
}

export function parseDashboardQuery(value: unknown): DashboardQuery {
  const input = dashboardRecord(value)
  if (`teamId` in input) throw new RangeError(`Your teams uses authenticated memberships.`)
  return {
    environment: option(input.environment, environments, `global`),
    period: option(input.period, periods, `30Days`),
    timeline: option(input.timeline, timelines, `playerActions`)
  }
}

export function dashboardInteger(value: unknown, minimum: number, maximum: number): number {
  const number = typeof value === `string` && value.trim() ? Number(value) : value
  if (typeof number !== `number` || !Number.isSafeInteger(number) || number < minimum || number > maximum) throw new RangeError(`Invalid dashboard number.`)
  return number
}

export function parseDashboardTimelineQuery(value: unknown): DashboardTimelineQuery & { maxBuckets: number } {
  const input = dashboardRecord(value)
  const range = input.range === undefined ? input : dashboardRecord(input.range)
  const start = dashboardInteger(range.start, 0, 8640000000000000)
  const end = dashboardInteger(range.end, start + 1, 8640000000000000)
  return { query: parseDashboardQuery(input.query ?? input), range: { start, end }, maxBuckets: dashboardInteger(input.maxBuckets ?? 120, 2, 120) }
}

export function parseDashboardPresence(value: unknown): DashboardPresenceInput {
  const input = dashboardRecord(value)
  if (`userId` in input || `sessionKey` in input || typeof input.instanceId !== `string` || !/^[\w-]{1,64}$/u.test(input.instanceId)) throw new RangeError(`Invalid presence identity.`)
  return { instanceId: input.instanceId, sequence: dashboardInteger(input.sequence, 1, Number.MAX_SAFE_INTEGER), gameServerId: input.gameServerId === null ? null : dashboardInteger(input.gameServerId, 1, 2147483647) }
}
