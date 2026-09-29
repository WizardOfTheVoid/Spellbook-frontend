import assert from 'node:assert/strict'
import test from 'node:test'
import { dashboardTimeRange, dashboardTimelineInterval, rescopeDashboardTimeline } from './dashboardTimelineRange'
import { defaultDashboardQuery, type DashboardPeriod } from './dashboardViewModel'
import { createDashboardPreviewData, createDashboardPreviewTimeline } from './preview/dashboardPreviewData'

test(`uses the full history domain and zooms presets into it`, () => {
  const history = createDashboardPreviewData(defaultDashboardQuery).timeline
  const durations: Partial<Record<DashboardPeriod, number>> = { '30Days': 30 * 86400000, '1Week': 7 * 86400000, '24Hours': 86400000, lastHour: 3600000 }
  assert.deepEqual(dashboardTimeRange(history, `allTime`), history.range)
  for (const [period, duration] of Object.entries(durations)) {
    const range = dashboardTimeRange(history, period as DashboardPeriod)
    assert.equal(range.end - range.start, duration)
    assert.equal(range.end, history.range!.end)
    assert.deepEqual(createDashboardPreviewData({ ...defaultDashboardQuery, period: period as DashboardPeriod }).timeline.buckets, history.buckets)
  }
})

test(`loads finer detail on zoom without losing action totals`, () => {
  const history = createDashboardPreviewData(defaultDashboardQuery).timeline
  const range = dashboardTimeRange(history, `30Days`)
  const coarse = createDashboardPreviewTimeline({ query: defaultDashboardQuery, range, maxBuckets: 30 })
  const fine = createDashboardPreviewTimeline({ query: defaultDashboardQuery, range, maxBuckets: 180 })
  assert.ok(fine.buckets.length > coarse.buckets.length)
  for (let index = 0; index < coarse.series.length; index++) {
    const sum = (values: readonly (number | null)[]) => values.reduce<number>((total, value) => total + (value ?? 0), 0)
    assert.equal(sum(coarse.series[index].values), sum(fine.series[index].values))
  }
  assert.equal(dashboardTimelineInterval({ start: 0, end: 3600000 }), 60000)
})

test(`aggregation preserves known zeroes and unknown history`, () => {
  const start = Date.parse(`2026-09-01T00:00:00Z`)
  const history = { buckets: [0, 1, 2, 3].map(index => new Date(start + index * 60000).toISOString()), intervalMs: 60000, range: { start, end: start + 240000 }, series: [{ id: `bans`, label: `Bans`, values: [null, 2, 0, 0] }] }
  const result = rescopeDashboardTimeline(history, history.range, 2)
  assert.equal(result.series[0].values[0], null)
  assert.equal(result.series[0].values.at(-1), 0)
})
import { dashboardTimelineBudget } from './dashboardTimelineRange'
import { parseDashboardTimelineQuery } from '@spellbook/shared/dashboard'

test(`timeline detail budgets fit the real API at ordinary and wide widths`, () => {
  for (const width of [320,640,1280,1920]) {
    const input = {query:defaultDashboardQuery,range:{start:0,end:100000},maxBuckets:dashboardTimelineBudget(width)}
    assert.doesNotThrow(() => parseDashboardTimelineQuery(input))
  }
})
