import assert from 'node:assert/strict'
import test from 'node:test'
import { parseDashboardSnapshot, parseDashboardTimelineData } from './dashboardValidation.js'

test(`rejects incompatible snapshots and malformed or excessive timeline data`, () => {
  assert.throws(() => parseDashboardSnapshot({ schemaVersion: 1 }), RangeError)
  const value = { buckets: [`2026-09-29T12:00:00.000Z`], series: [{ id: `ban`, label: `Bans`, values: [0] }] }
  assert.equal(parseDashboardTimelineData(value).series[0]!.values[0], 0)
  assert.equal(parseDashboardTimelineData({ ...value, series: [{ ...value.series[0], values: [null] }] }).series[0]!.values[0], null)
  for (const input of [{ ...value, series: [value.series[0], value.series[0]] }, { ...value, series: [{ ...value.series[0], values: [] }] }, { ...value, buckets: Array.from({length: 121}, () => value.buckets[0]) }, { ...value, series: [{...value.series[0], values: [-1]}] }]) {
    assert.throws(() => parseDashboardTimelineData(input), RangeError)
  }
})
