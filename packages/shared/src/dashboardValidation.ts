import { dashboardRecord, parseDashboardQuery, type DashboardSnapshot, type DashboardEntity, type DashboardRank, type DashboardTimelineData } from './dashboard.js'

function text(value: unknown): string {
  if (typeof value !== `string` || !value.trim() || value.length > 500) throw new RangeError(`Invalid dashboard text.`)
  return value
}

function instant(value: unknown): string {
  const time = text(value)
  if (!Number.isFinite(Date.parse(time)) || new Date(time).toISOString() !== time) throw new RangeError(`Invalid dashboard timestamp.`)
  return time
}

function count(value: unknown): number {
  if (typeof value !== `number` || !Number.isSafeInteger(value) || value < 0) throw new RangeError(`Invalid dashboard count.`)
  return value
}

function metric(value: unknown): number | null { return value === null ? null : count(value) }

function array(value: unknown, limit: number): unknown[] {
  if (!Array.isArray(value) || value.length > limit) throw new RangeError(`Invalid dashboard collection.`)
  return value
}

function unique<T extends { id: string }>(items: T[]): T[] {
  if (new Set(items.map(item => item.id)).size !== items.length) throw new RangeError(`Duplicate dashboard identities.`)
  return items
}

function entity(value: unknown): DashboardEntity {
  const item = dashboardRecord(value)
  const id = text(item.id)
  if (!/^(user|team|server):[1-9]\d*$/u.test(id)) throw new RangeError(`Invalid dashboard identity.`)
  return { id, name: text(item.name), avatar: item.avatar === null ? null : text(item.avatar) }
}

function rank(value: unknown): DashboardRank {
  const item = dashboardRecord(value)
  const position = count(item.rank)
  if (!position) throw new RangeError(`Invalid dashboard rank.`)
  return { ...entity(item), rank: position, count: count(item.count) }
}

function numbers(value: unknown, limit: number): number[] { return array(value, limit).map(count) }

export function parseDashboardTimelineData(value: unknown): DashboardTimelineData {
  const input = dashboardRecord(value)
  const buckets = array(input.buckets, 120).map(instant)
  if (buckets.some((at,index) => index > 0 && at <= buckets[index-1]!)) throw new RangeError(`Unordered dashboard timeline.`)
  const series = unique(array(input.series, 8).map(value => {
    const item = dashboardRecord(value)
    const values = array(item.values, 120).map(value => {
      if (value === null) return null
      if (typeof value !== `number` || !Number.isFinite(value) || value < 0) throw new RangeError(`Invalid timeline value.`)
      return value
    })
    if (values.length !== buckets.length) throw new RangeError(`Unaligned dashboard timeline.`)
    return { id: text(item.id), label: text(item.label), values }
  }))
  const range = input.range === undefined ? undefined : dashboardRecord(input.range)
  if (range && (count(range.start) >= count(range.end))) throw new RangeError(`Invalid dashboard range.`)
  const intervalMs = input.intervalMs === undefined ? undefined : count(input.intervalMs)
  if (intervalMs === 0) throw new RangeError(`Invalid dashboard interval.`)
  return { buckets, series, ...(range ? { range: { start: range.start as number, end: range.end as number } } : {}), ...(intervalMs ? { intervalMs } : {}) }
}

function coverage(value: unknown): DashboardSnapshot[`coverage`] {
  if (value !== `complete` && value !== `partial` && value !== `unavailable`) throw new RangeError(`Invalid dashboard coverage.`)
  return value
}

export function parseDashboardSnapshot(value: unknown): DashboardSnapshot {
  const input = dashboardRecord(value)
  if (input.schemaVersion !== 2) throw new RangeError(`Unsupported dashboard version.`)
  const live = dashboardRecord(input.live)
  const metrics = dashboardRecord(input.metrics)
  const boards = dashboardRecord(input.scoreboards)
  const totals = dashboardRecord(input.breakdown)
  const details = dashboardRecord(input.coverageDetails)
  const viewer = dashboardRecord(boards.viewerRank)
  const latest = live.latest === null ? null : dashboardRecord(live.latest)
  const protection = boards.protection === null ? null : dashboardRecord(boards.protection)
  const viewerId = text(input.viewerId)
  if (!/^user:[1-9]\d*$/u.test(viewerId)) throw new RangeError(`Invalid dashboard viewer.`)
  return { schemaVersion: 2, generatedAt: instant(input.generatedAt), query: parseDashboardQuery(input.query), viewerId,
    teams: unique(array(input.teams, 500).map(entity)),
    live: { admins: count(live.admins), servers: count(live.servers), players: count(live.players), playerServers: count(live.playerServers), gamePlayers: count(live.gamePlayers), avatars: unique(array(live.avatars,8).map(entity)),
      latest: latest ? { actor: entity(latest.actor), verb: text(latest.verb), server: latest.server === null ? null : entity(latest.server), at: instant(latest.at) } : null },
    scoreboards: { admins: unique(array(boards.admins,501).map(rank)), teams: unique(array(boards.teams,500).map(rank)), active: unique(array(boards.active,501).map(rank)),
      viewerRank: Object.fromEntries([`admins`,`teams`,`active`].filter(key => viewer[key] !== undefined).map(key => [key, rank(viewer[key])])),
      protection: protection ? { server: entity(protection.server), team: protection.team === null ? null : entity(protection.team), members: count(protection.members), actions: count(protection.actions), activity: numbers(protection.activity,120) } : null },
    metrics: { accounts: metric(metrics.accounts), money: metric(metrics.money), cheaterBans: metric(metrics.cheaterBans), wantedBans: metric(metrics.wantedBans),
      applications: metric(metrics.applications), actions: metric(metrics.actions), contribution: metric(metrics.contribution), servers: metric(metrics.servers), moneySeries: numbers(metrics.moneySeries,120) },
    breakdown: { bans: metric(totals.bans), kicks: metric(totals.kicks), warnings: metric(totals.warnings), unbans: metric(totals.unbans), serversay: metric(totals.serversay), adminsay: metric(totals.adminsay) },
    timeline: parseDashboardTimelineData(input.timeline), coverage: coverage(input.coverage),
    coverageDetails: { players: coverage(details.players), messages: coverage(details.messages), since: details.since === null ? null : instant(details.since) }
  }
}
