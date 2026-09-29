import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultDashboardQuery } from '../dashboardViewModel'
import { createDashboardPreviewData, createDashboardPreviewTimeline } from './dashboardPreviewData'

test(`scopes rankings, protection and live activity along with statistics`, () => {
  const global = createDashboardPreviewData(defaultDashboardQuery)
  const team = createDashboardPreviewData({ ...defaultDashboardQuery, environment: `team` })
  const you = createDashboardPreviewData({ ...defaultDashboardQuery, environment: `you` })
  const recent = createDashboardPreviewData({ ...defaultDashboardQuery, period: `24Hours` })
  assert.ok(global.scoreboards.admins.length > 5)
  assert.ok(global.scoreboards.teams.length > 5)
  assert.ok(team.scoreboards.admins.length < global.scoreboards.admins.length)
  assert.deepEqual(team.scoreboards.teams.map(row => row.id), team.teams.map(row => row.id))
  assert.ok(team.scoreboards.teams.length > 1)
  assert.ok(team.scoreboards.admins.some(row => row.id === `user:1`))
  assert.ok(team.scoreboards.admins.some(row => row.id === `user:2`))
  assert.ok(!team.scoreboards.admins.some(row => row.id === `user:3`))
  assert.ok(!team.live.avatars.some(row => row.id === `user:3`))
  assert.deepEqual(you.scoreboards.admins.map(row => row.id), [you.viewerId])
  assert.equal(you.live.latest?.actor.id, you.viewerId)
  assert.ok(team.teams.some(row => row.id === team.scoreboards.protection?.team?.id))
  assert.ok(recent.scoreboards.admins[0].count < global.scoreboards.admins[0].count)
  assert.ok(recent.scoreboards.protection!.actions < global.scoreboards.protection!.actions)
})

test(`keeps multiple member teams and their servers in overview and zoomed timeline data`, () => {
  const query = { ...defaultDashboardQuery, environment: `team` as const, timeline: `topTeams` as const }
  const data = createDashboardPreviewData(query)
  const expectedTeams = data.teams.map(team => team.id)
  assert.deepEqual(data.timeline.series.map(series => series.id), expectedTeams)
  const range = { start: data.timeline.range!.end - 86400000, end: data.timeline.range!.end }
  const detail = createDashboardPreviewTimeline({ query, range, maxBuckets: 48 })
  assert.deepEqual(detail.series.map(series => series.id), expectedTeams)
  assert.ok(detail.buckets.length > 1)
  const servers = createDashboardPreviewTimeline({ query: { ...query, timeline: `protectedServers` }, range })
  assert.deepEqual(servers.series.map(series => series.id), [`server:1`, `server:2`])
  const admins = createDashboardPreviewTimeline({ query: { ...query, timeline: `topAdmins` }, range })
  assert.ok(admins.series.some(series => series.id === `user:1`))
  assert.ok(admins.series.some(series => series.id === `user:2`))
  assert.ok(!admins.series.some(series => series.id === `user:3`))
})
