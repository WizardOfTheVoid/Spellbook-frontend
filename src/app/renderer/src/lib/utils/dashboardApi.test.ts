import assert from 'node:assert/strict'
import test from 'node:test'
import type { DashboardSnapshot } from '$lib/core'
import { parseDashboardSnapshot } from './dashboardApi'

function recentAction(input: Partial<DashboardSnapshot[`recentActions`][`bans`][number]> = {}) {
  return {
    id: 91,
    playerId: 22,
    playerName: `DuelEnjoyer`,
    actionType: `ban` as const,
    offenseType: `other` as const,
    duration: 210,
    scope: `local` as const,
    expiresAt: `2026-09-11T05:58:00.000Z`,
    unbannedAt: null,
    createdAt: `2026-09-02T11:58:00.000Z`,
    ...input,
  }
}

function validSnapshot(): DashboardSnapshot {
  return {
    generatedAt: `2026-09-02T12:00:00.000Z`,
    yourServers: { online: 2, total: 3, players: 41 },
    latestActions: { total24Hours: 9, buckets: [2, 0, 0, 7, 0, 0] },
    yourBans: { local: 12, wantedActions: 6, total: 18 },
    global: {
      localBans: 2841,
      wantedActions: 684,
      wantedServerApplications: 1120,
      playerActions: 6209,
      activeAdmins: 43,
      activeTeams: 10,
    },
    timeline: {
      bucketStarts: [
        `2026-08-20T00:00:00.000Z`,
        `2026-08-22T00:00:00.000Z`,
        `2026-08-24T00:00:00.000Z`,
        `2026-08-26T00:00:00.000Z`,
        `2026-08-28T00:00:00.000Z`,
        `2026-08-30T00:00:00.000Z`,
        `2026-09-01T00:00:00.000Z`,
      ],
      series: [
        { id: `user:7`, label: `Magic`, kind: `user`, values: [2, 0, 0, 7, 0, 0, 1] },
        { id: `global-average`, label: `Global average`, kind: `global-average`, values: [1.5, 0, 0, 2.5, 0, 0, 1] },
      ],
    },
    leaderboards: {
      individuals: [
        { userId: 7, name: `Magic`, actions: 18, trendPercent: 80 },
        { userId: 8, name: `New Admin`, actions: 7, trendPercent: null },
      ],
      teams: [
        { teamId: 3, name: `Masons`, actions: 21, trendPercent: 50 },
        { teamId: 4, name: `Agatha`, actions: 8, trendPercent: null },
      ],
    },
    recentActions: {
      bans: [recentAction()],
      kicks: [recentAction({
        id: 90,
        actionType: `kick`,
        offenseType: `ffa`,
        duration: null,
        expiresAt: null,
        createdAt: `2026-09-02T11:57:00.000Z`,
      })],
      unbans: [],
    },
  }
}

test(`round-trips a complete valid Dashboard snapshot`, () => {
  assert.deepEqual(parseDashboardSnapshot(validSnapshot()), validSnapshot())
})

test(`rejects malformed dates, series, and actions`, () => {
  assert.throws(() => parseDashboardSnapshot({ ...validSnapshot(), generatedAt: `today` }))
  assert.throws(() => parseDashboardSnapshot({
    ...validSnapshot(),
    timeline: {
      bucketStarts: validSnapshot().timeline.bucketStarts,
      series: [{ id: `user:7`, label: `Magic`, kind: `user`, values: [] }],
    },
  }))
  assert.throws(() => parseDashboardSnapshot({
    ...validSnapshot(),
    recentActions: { ...validSnapshot().recentActions, bans: [{ ...recentAction(), actionType: `dance` }] },
  }))
  assert.throws(() => parseDashboardSnapshot({
    ...validSnapshot(),
    recentActions: { ...validSnapshot().recentActions, bans: [recentAction({ offenseType: `spawn_killing` as never })] },
  }))
  assert.throws(() => parseDashboardSnapshot({
    ...validSnapshot(),
    recentActions: { ...validSnapshot().recentActions, bans: [recentAction({ unbannedAt: `2026-09-02T11:57:00.000Z` })] },
  }))
})

test(`rejects invalid numeric and collection boundaries`, () => {
  const snapshot = validSnapshot()
  const invalidValues: unknown[] = [
    { ...snapshot, yourServers: { ...snapshot.yourServers, players: -1 } },
    { ...snapshot, global: { ...snapshot.global, activeAdmins: 1.5 } },
    { ...snapshot, yourBans: { ...snapshot.yourBans, total: 19 } },
    { ...snapshot, latestActions: { ...snapshot.latestActions, buckets: [1] } },
    { ...snapshot, timeline: { ...snapshot.timeline, bucketStarts: [...snapshot.timeline.bucketStarts].reverse() } },
    { ...snapshot, timeline: { ...snapshot.timeline, series: [snapshot.timeline.series[0], snapshot.timeline.series[0]] } },
    { ...snapshot, timeline: { ...snapshot.timeline, series: snapshot.timeline.series.map(row => ({ ...row, kind: `other` })) } },
    { ...snapshot, leaderboards: { ...snapshot.leaderboards, individuals: Array.from({ length: 4 }, (_, index) => ({ userId: index + 1, name: `A`, actions: 4 - index, trendPercent: null })) } },
    { ...snapshot, leaderboards: { ...snapshot.leaderboards, teams: [{ teamId: 0, name: `A`, actions: 1, trendPercent: null }] } },
    { ...snapshot, recentActions: { ...snapshot.recentActions, bans: Array.from({ length: 4 }, (_, index) => recentAction({ id: 100 - index })) } },
    { ...snapshot, recentActions: { ...snapshot.recentActions, bans: [recentAction({ duration: 0 })] } },
  ]

  for (const value of invalidValues) assert.throws(() => parseDashboardSnapshot(value))
})

test(`rejects unsorted or duplicate identity rows`, () => {
  const snapshot = validSnapshot()
  assert.throws(() => parseDashboardSnapshot({
    ...snapshot,
    leaderboards: { ...snapshot.leaderboards, individuals: [
      { userId: 7, name: `A`, actions: 2, trendPercent: null },
      { userId: 7, name: `B`, actions: 1, trendPercent: null },
    ] },
  }))
  assert.throws(() => parseDashboardSnapshot({
    ...snapshot,
    leaderboards: { ...snapshot.leaderboards, individuals: [
      { userId: 8, name: `B`, actions: 1, trendPercent: null },
      { userId: 7, name: `A`, actions: 2, trendPercent: null },
    ] },
  }))
  assert.throws(() => parseDashboardSnapshot({
    ...snapshot,
    recentActions: { ...snapshot.recentActions, bans: [
      recentAction(),
      { ...recentAction(), id: 92, createdAt: `2026-09-02T11:59:00.000Z` },
    ] },
  }))
})
