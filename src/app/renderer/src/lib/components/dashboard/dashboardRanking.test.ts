import assert from 'node:assert/strict'
import test from 'node:test'
import { rankDashboardRows } from './dashboardRanking'
import { defaultDashboardQuery } from './dashboardViewModel'
import { createDashboardPreviewData } from './preview/dashboardPreviewData'

test(`reorders rankings by current scores and preserves stable ties without mutating input`, () => {
  const rows = [{ id: `one`, name: `One`, avatar: null, count: 10, rank: 1 }, { id: `two`, name: `Two`, avatar: null, count: 15, rank: 2 }, { id: `three`, name: `Three`, avatar: null, count: 10, rank: 3 }]
  const ranked = rankDashboardRows(rows)
  assert.deepEqual(ranked.map(row => [row.id, row.rank]), [[`two`, 1], [`one`, 2], [`three`, 3]])
  assert.deepEqual(rows.map(row => row.rank), [1, 2, 3])
  assert.deepEqual(rankDashboardRows([{ ...ranked[2], count: 20 }, ...ranked.slice(0, 2)]).map(row => row.id), [`three`, `two`, `one`])
})

test(`preview updates can change leaders on every contribution scoreboard`, () => {
  const first = createDashboardPreviewData(defaultDashboardQuery, `normal`, 0)
  const updated = createDashboardPreviewData(defaultDashboardQuery, `normal`, 10)
  for (const kind of [`admins`, `active`, `teams`] as const) {
    assert.notEqual(updated.scoreboards[kind][0].id, first.scoreboards[kind][0].id)
    assert.equal(updated.scoreboards[kind][0].rank, 1)
    assert.ok(updated.scoreboards[kind][0].count > first.scoreboards[kind][0].count)
  }
})
