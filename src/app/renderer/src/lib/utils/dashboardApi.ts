import {
  dashboardActionScopes,
  dashboardActionTypes,
  dashboardOffenseTypes,
  type DashboardActionScope,
  type DashboardActionType,
  type DashboardOffenseType,
  type DashboardRecentAction,
  type DashboardRecentActions,
  type DashboardSeries,
  type DashboardSnapshot,
} from '@spellbook/shared/dashboard.js'
import { getServerApi } from '$lib/core'
import { unwrap } from './apiResult'
import { isRecord, type JsonRecord } from './records'

function fail(field: string): never {
  throw new Error(`Invalid Dashboard ${field}.`)
}

function record(value: unknown, field: string): JsonRecord {
  if (!isRecord(value)) fail(field)
  return value
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) fail(field)
  return value
}

function text(value: unknown, field: string): string {
  if (typeof value !== `string` || value.trim().length === 0) fail(field)
  return value
}

function instant(value: unknown, field: string): string {
  const parsed = text(value, field)
  const date = new Date(parsed)
  if (Number.isNaN(date.getTime()) || date.toISOString() !== parsed) fail(field)
  return parsed
}

function integer(value: unknown, field: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) fail(field)
  return value as number
}

function finite(value: unknown, field: string): number {
  if (typeof value !== `number` || !Number.isFinite(value) || value < 0) fail(field)
  return value
}

function counts<T extends readonly string[]>(
  value: unknown,
  field: string,
  keys: T,
): { [K in T[number]]: number } {
  const source = record(value, field)
  return Object.fromEntries(keys.map(key => [key, integer(source[key], `${field}.${key}`)])) as {
    [K in T[number]]: number
  }
}

function parseSeries(value: unknown, bucketCount: number): DashboardSeries {
  const source = record(value, `timeline series`)
  const kind = source.kind
  if (kind !== `user` && kind !== `team` && kind !== `global-average`) fail(`timeline series kind`)
  const values = array(source.values, `timeline series values`).map((item, index) =>
    finite(item, `timeline series value ${index}`)
  )
  if (values.length !== bucketCount) fail(`timeline series length`)
  return {
    id: text(source.id, `timeline series id`),
    label: text(source.label, `timeline series label`),
    kind,
    values,
  }
}

function parseRanking(value: unknown, field: string, idKey: `userId` | `teamId`) {
  const rows = array(value, field)
  if (rows.length > 3) fail(`${field} length`)
  const ids = new Set<number>()
  const parsed = rows.map((value, index) => {
    const source = record(value, `${field} ${index}`)
    const id = integer(source[idKey], `${field} ${idKey}`, 1)
    if (ids.has(id)) fail(`${field} ${idKey}`)
    ids.add(id)
    const trendPercent = source.trendPercent === null
      ? null
      : integer(source.trendPercent, `${field} trendPercent`, -100)
    return {
      id,
      name: text(source.name, `${field} name`),
      actions: integer(source.actions, `${field} actions`),
      trendPercent,
    }
  })
  for (let index = 1; index < parsed.length; index += 1) {
    const previous = parsed[index - 1]!
    const current = parsed[index]!
    if (previous.actions < current.actions || previous.actions === current.actions && previous.id >= current.id) {
      fail(`${field} order`)
    }
  }
  return parsed
}

function actionType(value: unknown): DashboardActionType {
  if (typeof value !== `string` || !dashboardActionTypes.includes(value as DashboardActionType)) fail(`action type`)
  return value as DashboardActionType
}

function actionScope(value: unknown): DashboardActionScope {
  if (typeof value !== `string` || !dashboardActionScopes.includes(value as DashboardActionScope)) fail(`action scope`)
  return value as DashboardActionScope
}

function offenseType(value: unknown): DashboardOffenseType | null {
  if (value === null) return null
  if (typeof value !== `string` || !dashboardOffenseTypes.includes(value as DashboardOffenseType)) fail(`offense type`)
  return value as DashboardOffenseType
}

function optionalInstant(value: unknown, field: string): string | null {
  return value === null ? null : instant(value, field)
}

function parseRecentActions(
  value: unknown,
  field: keyof DashboardRecentActions,
  expectedType: DashboardActionType,
): readonly DashboardRecentAction[] {
  const rows = array(value, `recent ${field}`)
  if (rows.length > 3) fail(`recent ${field} length`)
  const ids = new Set<number>()
  const parsed = rows.map((value, index) => {
    const source = record(value, `recent ${field} ${index}`)
    const id = integer(source.id, `recent ${field} id`, 1)
    if (ids.has(id)) fail(`recent ${field} id`)
    ids.add(id)
    const playerName = source.playerName === null ? null : text(source.playerName, `recent ${field} playerName`)
    const type = actionType(source.actionType)
    if (type !== expectedType) fail(`recent ${field} action type`)
    const createdAt = instant(source.createdAt, `recent ${field} createdAt`)
    const expiresAt = optionalInstant(source.expiresAt, `recent ${field} expiresAt`)
    const unbannedAt = optionalInstant(source.unbannedAt, `recent ${field} unbannedAt`)
    if (expiresAt !== null && expiresAt < createdAt) fail(`recent ${field} expiresAt`)
    if (unbannedAt !== null && unbannedAt < createdAt) fail(`recent ${field} unbannedAt`)
    return <DashboardRecentAction>{
      id,
      playerId: integer(source.playerId, `recent ${field} playerId`, 1),
      playerName,
      actionType: type,
      offenseType: offenseType(source.offenseType),
      duration: source.duration === null ? null : integer(source.duration, `recent ${field} duration`, 1),
      scope: actionScope(source.scope),
      expiresAt,
      unbannedAt,
      createdAt,
    }
  })
  for (let index = 1; index < parsed.length; index += 1) {
    const previous = parsed[index - 1]!
    const current = parsed[index]!
    if (previous.createdAt < current.createdAt || previous.createdAt === current.createdAt && previous.id <= current.id) {
      fail(`recent ${field} order`)
    }
  }
  return parsed
}

export function parseDashboardSnapshot(value: unknown): DashboardSnapshot {
  const source = record(value, `snapshot`)
  const generatedAt = instant(source.generatedAt, `generatedAt`)
  const yourServers = counts(source.yourServers, `yourServers`, [`online`, `total`, `players`] as const)
  if (yourServers.online > yourServers.total) fail(`yourServers.online`)

  const latestSource = record(source.latestActions, `latestActions`)
  const latestBuckets = array(latestSource.buckets, `latestActions.buckets`).map((value, index) =>
    integer(value, `latestActions bucket ${index}`)
  )
  if (latestBuckets.length !== 6) fail(`latestActions bucket length`)
  const total24Hours = integer(latestSource.total24Hours, `latestActions.total24Hours`)
  if (total24Hours !== latestBuckets.reduce((sum, count) => sum + count, 0)) fail(`latestActions total`)

  const yourBans = counts(source.yourBans, `yourBans`, [`local`, `wantedActions`, `total`] as const)
  if (yourBans.total !== yourBans.local + yourBans.wantedActions) fail(`yourBans.total`)
  const global = counts(source.global, `global`, [
    `localBans`,
    `wantedActions`,
    `wantedServerApplications`,
    `playerActions`,
    `activeAdmins`,
    `activeTeams`,
  ] as const)

  const timelineSource = record(source.timeline, `timeline`)
  const bucketStarts = array(timelineSource.bucketStarts, `timeline.bucketStarts`).map((value, index) =>
    instant(value, `timeline bucket ${index}`)
  )
  if (bucketStarts.length !== 7) fail(`timeline bucket length`)
  for (let index = 1; index < bucketStarts.length; index += 1) {
    if (bucketStarts[index - 1]! >= bucketStarts[index]!) fail(`timeline bucket order`)
  }
  const series = array(timelineSource.series, `timeline.series`).map(value => parseSeries(value, bucketStarts.length))
  const ids = new Set(series.map(row => row.id))
  if (ids.size !== series.length) fail(`timeline series id`)
  if (series.filter(row => row.kind === `user`).length !== 1) fail(`timeline user series`)
  if (series.filter(row => row.kind === `global-average`).length !== 1) fail(`timeline global series`)

  const leaderboardsSource = record(source.leaderboards, `leaderboards`)
  const individuals = parseRanking(leaderboardsSource.individuals, `top individuals`, `userId`).map(row => ({
    userId: row.id,
    name: row.name,
    actions: row.actions,
    trendPercent: row.trendPercent,
  }))
  const teams = parseRanking(leaderboardsSource.teams, `top teams`, `teamId`).map(row => ({
    teamId: row.id,
    name: row.name,
    actions: row.actions,
    trendPercent: row.trendPercent,
  }))
  const recentSource = record(source.recentActions, `recent actions`)

  return {
    generatedAt,
    yourServers,
    latestActions: { total24Hours, buckets: latestBuckets },
    yourBans,
    global,
    timeline: { bucketStarts, series },
    leaderboards: { individuals, teams },
    recentActions: {
      bans: parseRecentActions(recentSource.bans, `bans`, `ban`),
      kicks: parseRecentActions(recentSource.kicks, `kicks`, `kick`),
      unbans: parseRecentActions(recentSource.unbans, `unbans`, `unban`),
    },
  }
}

export async function getDashboard(): Promise<DashboardSnapshot> {
  const value = await unwrap<unknown>(
    await getServerApi().dashboard.get(),
    `Dashboard request failed.`,
  )
  return parseDashboardSnapshot(value)
}
