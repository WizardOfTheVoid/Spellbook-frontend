import assert from 'node:assert/strict'
import test from 'node:test'
import { datePickerOverlayPosition, enabledPickerDates, formatPickerDate, pickerDate, pickerRangeLabels, pickerValue, withinPickerBounds } from './datePickerValues'

test(`picker dates retain their calendar day across timezones`, () => {
  const date = pickerDate(`2026-01-01`)
  assert.ok(date)
  assert.deepEqual([date.getFullYear(), date.getMonth(), date.getDate()], [2026, 0, 1])
  assert.equal(pickerValue(date), `2026-01-01`)
})

test(`date and time selections retain their wall clock fields`, () => {
  const date = pickerDate(`2026-09-21T14:30`)
  assert.ok(date)
  assert.equal(pickerValue(date, `14:30`), `2026-09-21T14:30`)
})

test(`invalid and out-of-bound picker selections do not produce values`, () => {
  assert.equal(pickerDate(`2026-02-30`), null)
  assert.equal(pickerDate(`2026-09-21T25:00`), null)
  assert.equal(pickerDate(`2026-09-21T14:60`), null)
  assert.equal(pickerDate(`invalid`), null)
  assert.equal(withinPickerBounds(`2026-09-01`, `2026-09-02`, null), false)
  assert.equal(withinPickerBounds(`2026-09-30`, null, `2026-09-29`), false)
  assert.equal(withinPickerBounds(`2026-09-15`, `2026-09-02`, `2026-09-29`), true)
})

test(`enabled picker dates include both limits and cross leap days in local time`, () => {
  const dates = enabledPickerDates(`2024-02-28`, `2024-03-01`)
  assert.deepEqual(dates, [
    new Date(2024, 1, 28).toDateString(),
    new Date(2024, 1, 29).toDateString(),
    new Date(2024, 2, 1).toDateString(),
  ])
  assert.deepEqual(enabledPickerDates(`2024-03-01`, `2024-02-28`), [])
})

test(`picker labels use readable local dates and omit repeated years within a range`, () => {
  assert.equal(formatPickerDate(`2026-08-29`), `Aug 29, 2026`)
  assert.deepEqual(pickerRangeLabels(`2026-08-29`, `2026-09-27`), {
    start: `Aug 29`, end: `Sep 27, 2026`,
  })
  assert.deepEqual(pickerRangeLabels(`2025-12-29`, `2026-01-02`), {
    start: `Dec 29, 2025`, end: `Jan 2, 2026`,
  })
  assert.equal(formatPickerDate(`invalid`), `invalid`)
})

test(`picker overlay stays in the app viewport and flips above a low trigger`, () => {
  assert.deepEqual(datePickerOverlayPosition({ left: 310, top: 100, bottom: 145 }, { width: 380, height: 300 }, { width: 600, height: 700 }), { x: 208, y: 149 })
  assert.deepEqual(datePickerOverlayPosition({ left: 20, top: 480, bottom: 525 }, { width: 380, height: 300 }, { width: 600, height: 700 }), { x: 20, y: 176 })
  assert.deepEqual(datePickerOverlayPosition({ left: 2, top: 180, bottom: 225 }, { width: 380, height: 300 }, { width: 320, height: 410 }), { x: 12, y: 98 })
})
