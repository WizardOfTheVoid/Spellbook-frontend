import assert from 'node:assert/strict'
import test from 'node:test'
import { metricHistoryRows } from './metricHistory'

test(`keeps observation times and unknown values without revealing future samples`, () => {
  const samples = [
    { timeMs: 8000, value: 0, lifetimeId: `a` },
    { timeMs: 1000, value: 100, lifetimeId: `a` },
    { timeMs: 2300, value: null, lifetimeId: `a` },
    { timeMs: 9000, value: 90, lifetimeId: `a` },
  ]
  assert.deepEqual(metricHistoryRows(samples, 8000), [
    { timeMs: 1000, value: 100 },
    { timeMs: 2300, value: null },
    { timeMs: 8000, value: 0 },
  ])
  assert.equal(samples[0].timeMs, 8000)
})

test(`breaks the plotted line at a lifetime boundary without discarding the new observation`, () => {
  assert.deepEqual(metricHistoryRows([
    { timeMs: 2000, value: 0, lifetimeId: `first` },
    { timeMs: 5200, value: 150, lifetimeId: `second` },
  ], 5200), [
    { timeMs: 2000, value: 0 },
    { timeMs: 5200, value: null },
    { timeMs: 5200, value: 150 },
  ])
})

test(`invalid measurements remain gaps and invalid timestamps are excluded`, () => {
  assert.deepEqual(metricHistoryRows([
    { timeMs: NaN, value: 10, lifetimeId: `a` },
    { timeMs: 1000, value: Infinity, lifetimeId: `a` },
  ], 1000), [{ timeMs: 1000, value: null }])
})
