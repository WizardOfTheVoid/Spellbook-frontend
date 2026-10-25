import assert from 'node:assert/strict'
import test from 'node:test'
import { dashboardBrushRange, dashboardBrushKeyRange } from './dashboardTimelineBrush'

const bounds = { start: Date.parse(`2026-09-01T00:00:00Z`), end: Date.parse(`2026-10-01T00:00:00Z`) }

test(`native time selections retain absolute instants and clamp to available history`, () => {
  const start = new Date(`2026-09-29T12:00:00Z`)
  const end = new Date(`2026-09-29T13:00:00Z`)
  assert.deepEqual(dashboardBrushRange([start, end], bounds), { start: +start, end: +end })
  assert.deepEqual(dashboardBrushRange([bounds.start - 1, bounds.end + 1], bounds), bounds)
  assert.deepEqual(dashboardBrushRange([], bounds), bounds)
  assert.equal(dashboardBrushRange([bounds.end - 1, bounds.end], bounds).end - dashboardBrushRange([bounds.end - 1, bounds.end], bounds).start, 60000)
})

test(`keyboard panning preserves duration and resizing remains inside history`, () => {
  const range = { start: bounds.start + 86400000, end: bounds.start + 2 * 86400000 }
  const moved = dashboardBrushKeyRange(range, bounds, `ArrowRight`, `move`)!
  assert.equal(moved.end - moved.start, range.end - range.start)
  assert.ok(moved.start > range.start)
  const earliest = dashboardBrushKeyRange(range, bounds, `Home`, `move`)!
  assert.equal(earliest.start, bounds.start)
  assert.equal(earliest.end - earliest.start, range.end - range.start)
  const resized = dashboardBrushKeyRange(range, bounds, `ArrowRight`, `left`)!
  assert.ok(resized.start > range.start)
  assert.equal(resized.end, range.end)
  assert.equal(dashboardBrushKeyRange(range, bounds, `Tab`, `left`), null)
})
