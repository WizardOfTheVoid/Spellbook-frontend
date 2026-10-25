import { cumulativeDashboardMoney } from '../dashboardTimelineData'
import { dashboardTimelineInterval } from '../dashboardTimelineRange'
import { rankDashboardRows } from '../dashboardRanking'
import { estimateCheaterMoney } from '@spellbook/shared/dashboard.js'
import type { DashboardEntity, DashboardRank, DashboardTimelineData, DashboardTimelineQuery, DashboardViewModel, DashboardViewQuery, DashboardRankingKind } from '../dashboardViewModel'

export type DashboardPreviewScenario = `normal` | `empty` | `loading` | `error` | `stale` | `partial` | `unavailable` | `noTeam` | `longNames`
export const dashboardPreviewScenarios: { value: DashboardPreviewScenario, label: string }[] = [
  { value: `normal`, label: `Active community` }, { value: `empty`, label: `No activity` }, { value: `loading`, label: `Loading` }, { value: `error`, label: `Initial error` }, { value: `stale`, label: `Refresh failure` }, { value: `partial`, label: `Partial history` }, { value: `unavailable`, label: `Unavailable history` }, { value: `noTeam`, label: `No readable team` }, { value: `longNames`, label: `Long names` },
]
const colors = [`#a65cff`, `#76a9e8`, `#cb6ebc`, `#59c0bf`, `#edb067`]
function avatar(name: string, index: number): string {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="20" fill="${colors[index % colors.length]}"/><circle cx="20" cy="20" r="18" fill="#111f30" fill-opacity=".45"/><text x="20" y="26" text-anchor="middle" font-family="sans-serif" font-size="17" font-weight="600" fill="white">${name[0]}</text></svg>`)}`
}
const names = [`MAGIC`, `Aurora`, `Raven`, `Orion`, `Lyra`, `Atlas`, `Nova`, `Ember`, `Wren`, `Sol`, `Astra`, `Echo`, `Rune`, `Skye`, `Vale`, `Ash`, `Nyx`, `Frost`]
export const dashboardPreviewAdmins: DashboardEntity[] = names.map((name, index) => ({ id: `user:${index + 1}`, name, avatar: avatar(name, index) }))
export const dashboardPreviewTeams: DashboardEntity[] = [`Arcane Guard`, `Silver Ward`, `Night Watch`, `Ember Guard`, `Sentinels`, `Iron Crown`, `Dawn Patrol`, `Frost Guard`, `The Vanguard`, `Moonlight`].map((name, index) => ({ id: `team:${index + 1}`, name, avatar: avatar(name, index) }))
const servers: DashboardEntity[] = [`EU Training Grounds`, `NA East Frontline`, `EU Duel Arena`, `NA Central Battleground`, `OCE Community`].map((name, index) => ({ id: `server:${index + 1}`, name, avatar: null }))
const adminCounts = [928, 812, 764, 611, 582, 240, 208, 170, 151, 143, 82, 54, 38, 27, 22, 20, 19, 16]
export function dashboardPreviewRanking(kind: DashboardRankingKind, scenario: DashboardPreviewScenario): DashboardRank[] {
  if (scenario === `empty`) return []
  const entities = kind === `teams` ? dashboardPreviewTeams : dashboardPreviewAdmins
  const counts = kind === `admins` ? adminCounts : kind === `teams` ? [1740, 1120, 884, 608, 420, 77, 20, 14, 5, 2] : [1982, 2416, 1744, 1221, 982, 708, 630, 600, 517, 460, 415, 321, 260, 200, 180, 105, 67, 38]
  return entities.map((entity, index) => ({ ...entity, name: scenario === `longNames` ? `${entity.name} · The extraordinarily dedicated community guardians` : entity.name, count: counts[index], rank: 0 })).sort((a, b) => b.count - a.count).map((row, index) => ({ ...row, rank: index + 1 }))
}
const periodFactor = { allTime: 5.1, '30Days': 1, '1Week': .26, '24Hours': .043, lastHour: .006 }
const shape = [48, 72, 92, 122, 77, 84, 146, 114, 75, 95, 66, 117, 118, 126, 133, 127, 150, 142, 191, 284, 377, 272, 116, 97, 106, 119, 160, 231, 162, 128]
const historyEnd = Date.parse(`2026-09-29T12:00:00Z`)
const day = 86400000
const historyRange = { start: historyEnd - 180 * day, end: historyEnd }
const viewerTeams = dashboardPreviewTeams.slice(0, 2)
const viewerTeamIds = new Set(viewerTeams.map(team => team.id))
const environmentFactor = (query: DashboardViewQuery) => query.environment === `global` ? 1 : query.environment === `team` ? .66 : .154
const adminTeam = (id: string) => `team:${(Number(id.split(`:`)[1]) - 1) % 6 + 1}`
const serverTeam = (id: string) => id.replace(`server:`, `team:`)
const scopedAdmins = (query: DashboardViewQuery) => dashboardPreviewAdmins.filter(admin => query.environment === `global` || (query.environment === `you` ? admin.id === `user:1` : viewerTeamIds.has(adminTeam(admin.id))))
const scopedTeams = (query: DashboardViewQuery) => query.environment === `global` ? dashboardPreviewTeams : viewerTeams
const scopedServers = (query: DashboardViewQuery) => servers.filter(server => query.environment === `global` || viewerTeamIds.has(serverTeam(server.id)))

export function createDashboardPreviewTimeline(request: DashboardTimelineQuery, scenario: DashboardPreviewScenario = `normal`, tick = 0): DashboardTimelineData {
  const { query, range } = request
  const intervalMs = dashboardTimelineInterval(range, request.maxBuckets)
  const count = Math.ceil((range.end - range.start) / intervalMs)
  const buckets = Array.from({ length: count }, (_, index) => new Date(range.start + index * intervalMs).toISOString())
  const entities = query.timeline === `playerActions` ? [{ id: `ban`, name: `Bans` }, { id: `kick`, name: `Kicks` }, { id: `warn`, name: `Warnings` }, { id: `unban`, name: `Unbans` }, { id: `serversay`, name: `Serversay` }, { id: `adminsay`, name: `Adminsay` }] : query.timeline === `protectedServers` ? scopedServers(query) : query.timeline === `topTeams` ? scopedTeams(query).slice(0, 5) : scopedAdmins(query).slice(0, 5)
  return { range, intervalMs, buckets, series: entities.map((entity, seriesIndex) => ({
    id: entity.id, label: entity.name,
    values: buckets.map((bucket, index) => {
      const start = Date.parse(bucket)
      const end = Math.min(range.end, start + intervalMs)
      if (scenario === `unavailable` || scenario === `partial` && start < historyRange.start + 45 * day) return null
      if (scenario === `empty`) return 0
      let value = 0
      for (let current = Math.floor((start - historyRange.start) / day); historyRange.start + current * day < end; current++) {
        const from = historyRange.start + current * day
        const daily = Math.round(shape[((current % shape.length) + shape.length) % shape.length] * environmentFactor(query) * [.32, .51, .13, .04, .07, .09][seriesIndex])
        value += Math.floor(daily * Math.min(day, end - from) / day) - Math.floor(daily * Math.max(0, start - from) / day)
      }
      return value + (index === count - 1 && end === historyRange.end ? tick : 0)
    }),
  })) }
}
export function createDashboardPreviewData(query: DashboardViewQuery, scenario: DashboardPreviewScenario = `normal`, tick = 0): DashboardViewModel {
  const factor = periodFactor[query.period] * environmentFactor(query)
  const count = (value: number) => scenario === `unavailable` ? null : scenario === `empty` ? 0 : Math.round(value * factor)
  const breakdown = { bans: count(1064 + tick), kicks: count(3128), warnings: count(612), unbans: count(86), serversay: count(4152), adminsay: count(3804) }
  const accounts = count(248 + Math.floor(tick / 3))
  const actions = scenario === `unavailable` ? null : Object.values(breakdown).reduce<number>((total, value) => total + (value ?? 0), 0)
  const generatedAt = new Date(Date.parse(`2026-09-29T12:00:00Z`) + tick * 5000).toISOString()
  const moneySeries = cumulativeDashboardMoney(Array.from({ length: 30 }, (_, index) => scenario === `empty` || scenario === `unavailable` ? 0 : Math.round((index % 4 + 2) * factor)))
  const adminIds = new Set(scopedAdmins(query).map(admin => admin.id))
  const teamIds = new Set(scopedTeams(query).map(team => team.id))
  const ranking = (kind: DashboardRankingKind) => {
    const challenger = { admins: `user:2`, active: `user:1`, teams: `team:2` }[kind]
    const increment = { admins: 28, active: 65, teams: 85 }[kind]
    const ids = kind === `teams` ? teamIds : adminIds
    const rows = dashboardPreviewRanking(kind, scenario).filter(row => ids.has(row.id)).map(row => ({ ...row, count: count(row.count + (row.id === challenger ? tick * increment : 0)) ?? 0 }))
    return rankDashboardRows(rows)
  }
  const admins = ranking(`admins`)
  const active = ranking(`active`)
  const presence = scenario === `empty` ? [] : scopedAdmins(query).slice(0, Math.max(1, Math.round(18 * environmentFactor(query) * Math.min(1, periodFactor[query.period]))))
  const team = scopedTeams(query)[0]
  const server = scopedServers(query)[0]
  return {
    query: { ...query }, generatedAt, viewerId: `user:1`, teams: scenario === `noTeam` ? [] : viewerTeams,
    live: { admins: presence.length, servers: presence.length ? Math.min(12, Math.max(1, Math.round(12 * factor))) : 0, players: scenario === `empty` || scenario === `noTeam` ? 0 : 73, playerServers: scenario === `empty` || scenario === `noTeam` ? 0 : 2, gamePlayers: scenario === `empty` ? 0 : 5200 + tick * 3, avatars: presence.slice(0, 5), latest: !presence.length ? null : { actor: presence[query.environment === `you` ? 0 : Math.min(2, presence.length - 1)], verb: tick % 3 === 1 ? `kicked a player` : `warned a player`, server, at: new Date(Date.parse(generatedAt) - 8000).toISOString() } },
    scoreboards: { admins, teams: ranking(`teams`), active, viewerRank: { admins: admins.find(row => row.id === `user:1`), active: active.find(row => row.id === `user:1`) }, protection: scenario === `empty` || scenario === `unavailable` ? null : { server, team, members: query.environment === `you` ? 1 : Math.max(1, Math.round(8 * environmentFactor(query))), actions: count(1742 + tick) ?? 0, activity: [3, 5, 4, 9, 7, 12, 10, 16, 13, 19, 17, 22].map(value => count(value) ?? 0) } },
    metrics: { accounts, money: accounts === null ? null : estimateCheaterMoney(accounts), cheaterBans: count(268), wantedBans: count(97), applications: count(434), actions, contribution: query.environment === `you` ? actions : count(1982), servers: count(42), moneySeries: moneySeries.map(value => accounts === null || !moneySeries.at(-1) ? 0 : estimateCheaterMoney(value / moneySeries.at(-1)! * accounts)) },
    breakdown, timeline: createDashboardPreviewTimeline({ query, range: historyRange }, scenario, tick), coverage: scenario === `partial` ? `partial` : scenario === `unavailable` ? `unavailable` : `complete`,
  }
}
