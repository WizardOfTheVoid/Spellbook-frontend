import assert from 'node:assert/strict'
import test from 'node:test'
import type { DashboardSnapshot } from '$lib/core'
import { createDashboardPresentation } from './dashboardPresentation'

function snapshot(): DashboardSnapshot {
  return {
    generatedAt: `2026-09-02T11:55:00.000Z`,
    yourServers: { online: 0, total: 0, players: 0 },
    latestActions: { total24Hours: 10, buckets: [0, 1, 2, 3, 4, 0] },
    yourBans: { local: 0, wantedActions: 0, total: 0 },
    global: {
      localBans: 1,
      wantedActions: 2,
      wantedServerApplications: 3,
      playerActions: 4,
      activeAdmins: 5,
      activeTeams: 6,
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
        { id: `user:7`, label: `Magic`, kind: `user`, values: [0, 0, 0, 0, 0, 0, 0] },
        { id: `global-average`, label: `Global average`, kind: `global-average`, values: [0, 0, 0, 0, 0, 0, 0] },
      ],
    },
    leaderboards: {
      individuals: [
        { userId: 7, name: `Magic`, actions: 10, trendPercent: 18 },
        { userId: 8, name: `New Admin`, actions: 4, trendPercent: null },
        { userId: 9, name: `Quieter`, actions: 2, trendPercent: -20 },
      ],
      teams: [{ teamId: 3, name: `Masons`, actions: 20, trendPercent: 25 }],
    },
    recentActions: {
      bans: [{
        id: 91,
        playerId: 22,
        playerName: `DuelEnjoyer`,
        actionType: `ban`,
        offenseType: `other`,
        duration: 210,
        scope: `local`,
        expiresAt: `2026-09-11T05:58:00.000Z`,
        unbannedAt: null,
        createdAt: `2026-09-02T11:58:00.000Z`,
      }],
      kicks: [],
      unbans: [],
    },
  }
}

test(`formats UTC labels, trends, actions, progress, and activity bars`, () => {
  const view = createDashboardPresentation(snapshot(), new Date(`2026-09-02T12:00:00.000Z`), `en`)

  assert.deepEqual(view.labels, [`Aug 20`, `Aug 22`, `Aug 24`, `Aug 26`, `Aug 28`, `Aug 30`, `Sep 1`])
  assert.equal(view.generatedAt, `5 min ago`)
  assert.equal(view.leaderboards.individuals[0]?.trend, `+18%`)
  assert.equal(view.leaderboards.individuals[1]?.trend, `New`)
  assert.equal(view.leaderboards.individuals[2]?.trend, `-20%`)
  assert.equal(view.leaderboards.teams[0]?.trend, `+25%`)
  assert.equal(view.recentActions.bans[0]?.subtitle, `Other · Local`)
  assert.equal(view.recentActions.bans[0]?.durationLabel, `0/210 hrs`)
  assert.equal(view.recentActions.bans[0]?.time, `2 min ago`)
  assert.equal(view.recentActions.bans[0]?.player, `DuelEnjoyer`)
  assert.equal(view.localBanWidth, 0)
  assert.deepEqual(view.latestBarHeights, [`0%`, `25%`, `50%`, `75%`, `100%`, `0%`])
})

test(`maps tabbed action types and preserves original player-name display`, () => {
  const value = snapshot()
  const ban = value.recentActions.bans[0]!
  const view = createDashboardPresentation({
    ...value,
    recentActions: {
      bans: [{ ...ban, playerName: `Nåme 0`, offenseType: `hacker`, scope: `global` }],
      kicks: [{
        ...ban,
        id: 2,
        playerId: 21,
        playerName: null,
        actionType: `kick`,
        offenseType: `ffa`,
        duration: null,
        expiresAt: null,
      }],
      unbans: [{
        ...ban,
        id: 3,
        playerId: 22,
        playerName: `Nåme 2`,
        actionType: `unban`,
        offenseType: null,
        duration: null,
        expiresAt: null,
      }],
    },
  }, new Date(`2026-09-02T12:00:00.000Z`), `en`)

  const actions = [
    view.recentActions.bans[0],
    view.recentActions.kicks[0],
    view.recentActions.unbans[0],
  ]
  assert.deepEqual(actions.map(item => [item?.subtitle, item?.icon]), [
    [`Hacker · Global`, `fa-ban`],
    [`Kick · Local`, `fa-person-walking-arrow-right`],
    [`Unban · Local`, `fa-unlock`],
  ])
  assert.deepEqual(actions.map(item => item?.player), [`Nåme 0`, `Player #21`, `Nåme 2`])
})

test(`shows served and total ban hours through expiry, early unban, and permanence`, () => {
  const value = snapshot()
  const ban = value.recentActions.bans[0]!
  const active = {
    ...ban,
    createdAt: `2026-09-01T15:30:00.000Z`,
    expiresAt: `2026-09-10T09:30:00.000Z`,
    duration: 210,
  }
  const view = createDashboardPresentation({
    ...value,
    recentActions: {
      bans: [
        active,
        { ...active, id: 92, unbannedAt: `2026-09-03T11:30:00.000Z` },
        { ...active, id: 93, duration: null, expiresAt: null },
      ],
      kicks: [],
      unbans: [],
    },
  }, new Date(`2026-09-03T12:00:00.000Z`), `en`)

  assert.deepEqual(view.recentActions.bans.map(item => item.durationLabel), [
    `44/210 hrs`,
    `44/210 hrs`,
    `Permanent`,
  ])
  const expired = createDashboardPresentation({
    ...value,
    recentActions: { bans: [active], kicks: [], unbans: [] },
  }, new Date(`2026-09-12T12:00:00.000Z`), `en`)
  assert.equal(expired.recentActions.bans[0]?.durationLabel, `210/210 hrs`)
})
