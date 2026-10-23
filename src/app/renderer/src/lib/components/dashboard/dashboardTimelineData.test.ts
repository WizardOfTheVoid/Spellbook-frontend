import assert from 'node:assert/strict'
import test from 'node:test'
import { createDashboardChartData, cumulativeDashboardMoney, dashboardSeriesColor, selectDashboardTimeline, toggleDashboardSeries, withDashboardTimelineAverage } from './dashboardTimelineData'
import { defaultDashboardQuery, type DashboardPeriod } from './dashboardViewModel'
import { createDashboardPreviewData } from './preview/dashboardPreviewData'

test(`message series start hidden and toggling excludes their totals and gaps without changing history`, () => {
  const timeline = { buckets: [`old`, `now`], series: [
    { id: `ban`, label: `Bans`, values: [0, 2] },
    { id: `serversay`, label: `Serversay`, values: [null, 7] },
    { id: `adminsay`, label: `Adminsay`, values: [null, 3] },
  ] }
  assert.deepEqual(selectDashboardTimeline(timeline).series.map(series => series.values), [[0, 2]])
  const enabled = toggleDashboardSeries([`serversay`, `adminsay`], `serversay`)
  assert.deepEqual(selectDashboardTimeline(timeline, enabled).series.map(series => series.values), [[0, 2], [null, 7]])
  const disabled = toggleDashboardSeries(enabled, `serversay`)
  assert.deepEqual(selectDashboardTimeline(timeline, disabled).series.map(series => series.values), [[0, 2]])
  assert.equal(timeline.series.length, 3)
  assert.equal(selectDashboardTimeline(timeline, disabled).buckets, timeline.buckets)
})

test(`keeps recorded zero buckets and unavailable buckets as gaps`, () => {
  const chart = createDashboardChartData({ buckets: [`2026-09-01`, `2026-09-02`, `2026-09-03`, `2026-09-04`], series: [{ id: `bans`, label: `Bans`, color: `#b05cff`, values: [null, 0, 2, 0] }] })
  assert.deepEqual(chart.rows.map((row: any) => row.bans), [null, 0, 2, 0])
  assert.equal(chart.rows[0].bucket, `2026-09-01`)
})

test(`keeps entity colors stable across rank order changes`, () => {
  const first = createDashboardChartData({ buckets: [`2026-09-01`], series: [{ id: `user:7`, label: `Seven`, values: [1] }, { id: `user:9`, label: `Nine`, values: [2] }] })
  const second = createDashboardChartData({ buckets: [`2026-09-01`], series: [{ id: `user:9`, label: `Nine`, values: [3] }, { id: `user:7`, label: `Seven`, values: [1] }] }, first)
  assert.notEqual(first.config, second.config)
  assert.equal((first.config as any)[`user:7`]?.colors.light[0], dashboardSeriesColor(`user:7`))
  assert.equal((second.config as any)[`user:7`]?.colors.light[0], dashboardSeriesColor(`user:7`))
  assert.notEqual(dashboardSeriesColor(`user:7`), ``)
})

test(`prices cumulative accounts at 4.73 dollars and rounds only the displayed total`, () => {
  assert.deepEqual(cumulativeDashboardMoney([1, 0, 2]), [5, 5, 14])
  assert.deepEqual(cumulativeDashboardMoney([]), [])
})

test(`averages the displayed series per bucket and keeps zeroes and unknown history`, () => {
  const timeline = { buckets: [`zero`, `known`, `partial`, `missing`], series: [{ id: `one`, label: `One`, values: [0, 6, 4, null] }, { id: `two`, label: `Two`, values: [0, 2, null, null] }] }
  const averaged = withDashboardTimelineAverage(timeline)
  assert.deepEqual(averaged.series.at(-1)?.values, [0, 4, null, null])
  assert.equal(timeline.series.length, 2)
  assert.deepEqual(withDashboardTimelineAverage(averaged).series.at(-1)?.values, [0, 4, null, null])
  assert.deepEqual(withDashboardTimelineAverage({ buckets: [], series: [] }).series, [])
})

test(`reuses unchanged chart rows and metadata on refresh`, () => {
  const timeline = { buckets: [`first`, `latest`], series: [{ id: `bans`, label: `Bans`, values: [1, 2] }] }
  const first = createDashboardChartData(timeline)
  const unchanged = createDashboardChartData(timeline, first)
  assert.equal(unchanged.rows, first.rows)
  assert.equal(unchanged.config, first.config)

  const refreshed = createDashboardChartData({ ...timeline, series: [{ ...timeline.series[0], values: [1, 3] }] }, first)
  assert.equal(refreshed.config, first.config)
  assert.equal(refreshed.rows[0], first.rows[0])
  assert.notEqual(refreshed.rows[1], first.rows[1])
  assert.equal(refreshed.rows[1].bans, 3)
})

test(`updates chart metadata and rows when the selection changes`, () => {
  const first = createDashboardChartData({ buckets: [`first`], series: [{ id: `bans`, label: `Bans`, values: [1] }] })
  const renamed = createDashboardChartData({ buckets: [`first`], series: [{ id: `bans`, label: `Recorded bans`, color: `#123456`, values: [1] }] }, first)
  assert.notEqual(renamed.config, first.config)
  assert.equal(renamed.config.bans.label, `Recorded bans`)
  assert.deepEqual(renamed.config.bans.colors?.dark, [`#123456`])

  const changed = createDashboardChartData({ buckets: [`next`], series: [{ id: `kicks`, label: `Kicks`, values: [0] }] }, first)
  assert.deepEqual(changed.rows, [{ bucket: `next`, kicks: 0 }])
  assert.deepEqual(Object.keys(changed.config), [`kicks`])
})

test(`keeps closed preview buckets stable between five-second refreshes`, () => {
  const periods: DashboardPeriod[] = [`allTime`, `30Days`, `1Week`, `24Hours`, `lastHour`]
  for (const period of periods) {
    const query = { ...defaultDashboardQuery, period }
    const first = createDashboardPreviewData(query, `normal`, 0)
    const refreshed = createDashboardPreviewData(query, `normal`, 1)
    assert.deepEqual(refreshed.timeline.buckets, first.timeline.buckets)
    assert.deepEqual(refreshed.timeline.series[0].values.slice(0, -1), first.timeline.series[0].values.slice(0, -1))
    assert.equal(refreshed.timeline.series[0].values.at(-1), first.timeline.series[0].values.at(-1)! + 1)
    assert.equal(Date.parse(refreshed.generatedAt) - Date.parse(first.generatedAt), 5000)
  }
})
