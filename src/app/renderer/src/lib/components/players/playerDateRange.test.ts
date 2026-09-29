import assert from 'node:assert/strict'
import test from 'node:test'
import { playerDatePresets, playerLastSeenRangeValues, playerRangeValues } from './playerDateRange'

test(`recent account presets include today and count calendar days`, () => {
  const presets = playerDatePresets(new Date(2026, 2, 1, 12))
  assert.deepEqual(presets.map(({ label }) => label), [`All time`, `Last 30 days`, `Last 60 days`, `Last 90 days`])
  assert.deepEqual(presets.slice(1).map(({ start, end }) => playerRangeValues(start, end)), [
    { createdAfter: `2026-01-31`, createdBefore: `2026-03-01` },
    { createdAfter: `2026-01-01`, createdBefore: `2026-03-01` },
    { createdAfter: `2025-12-02`, createdBefore: `2026-03-01` },
  ])
})

test(`player range values preserve a single bound and all-time clearing`, () => {
  assert.deepEqual(playerRangeValues(new Date(2026, 8, 1, 12), null), { createdAfter: `2026-09-01`, createdBefore: `` })
  assert.deepEqual(playerRangeValues(null, new Date(2026, 8, 30, 12)), { createdAfter: ``, createdBefore: `2026-09-30` })
  assert.deepEqual(playerRangeValues(null, null), { createdAfter: ``, createdBefore: `` })
})

test(`last active range values preserve the selected calendar days`, () => {
  assert.deepEqual(playerLastSeenRangeValues(new Date(2026, 7, 29, 12), new Date(2026, 8, 27, 12)), {
    lastSeenAfter: `2026-08-29`, lastSeenBefore: `2026-09-27`,
  })
  assert.deepEqual(playerLastSeenRangeValues(null, null), { lastSeenAfter: ``, lastSeenBefore: `` })
})

test(`all time clears both bounds and recent presets never precede the player archive`, () => {
  const presets = playerDatePresets(new Date(2021, 5, 10, 12))
  assert.deepEqual(presets[0], { label: `All time`, start: null, end: null })
  assert.deepEqual(presets.slice(1).map(({ start, end }) => playerRangeValues(start, end)), [
    { createdAfter: `2021-06-08`, createdBefore: `2021-06-10` },
    { createdAfter: `2021-06-08`, createdBefore: `2021-06-10` },
    { createdAfter: `2021-06-08`, createdBefore: `2021-06-10` },
  ])
})
