import assert from 'node:assert/strict'
import test from 'node:test'
import { ruleClockBounds, ruleClockInput, ruleClockValue, ruleDateInput, ruleDateValue, repeatedRuleDate, repeatedRuleClock } from './ruleDateInput'

test(`date pickers use the selected timezone and serialize absolute UTC instants`, () => {
  const cases = [
    [`Europe/Oslo`, `2026-09-21T12:30:00.000Z`, `2026-09-21T14:30`],
    [`Europe/Oslo`, `2026-01-21T13:30:00.000Z`, `2026-01-21T14:30`],
    [`UTC`, `2026-09-21T12:30:00.000Z`, `2026-09-21T12:30`],
    [`Asia/Kathmandu`, `2026-09-21T23:30:00.000Z`, `2026-09-22T05:15`],
    [`America/St_Johns`, `2026-01-21T02:30:00.000Z`, `2026-01-20T23:00`],
    [`Europe/Oslo`, `2024-02-28T23:00:00.000Z`, `2024-02-29T00:00`],
  ]
  for (const [zone, utc, local] of cases) {
    assert.equal(ruleDateInput(utc, zone), local)
    assert.equal(ruleDateValue(local, zone), utc)
  }
})

test(`unchanged local fields preserve seconds, offsets and the later occurrence of a repeated hour`, () => {
  for (const original of [`2026-09-21T14:30:45+02:00`, `2026-10-25T00:30:45.123Z`, `2026-10-25T01:30:00.000Z`]) {
    assert.equal(ruleDateValue(ruleDateInput(original, `Europe/Oslo`), `Europe/Oslo`, original), original)
  }
  assert.equal(ruleDateValue(`2026-09-21T14:31`, `Europe/Oslo`, `2026-09-21T12:30:45Z`), `2026-09-21T12:31:00.000Z`)
})

test(`skipped local times are rejected and newly selected repeated hours use their first occurrence`, () => {
  assert.throws(() => ruleDateValue(`2026-03-29T02:30`, `Europe/Oslo`), RangeError)
  assert.equal(ruleDateValue(`2026-10-25T02:30`, `Europe/Oslo`), `2026-10-25T00:30:00.000Z`)
  assert.equal(repeatedRuleDate(`2026-10-25T02:30`, `Europe/Oslo`), true)
  assert.equal(repeatedRuleDate(`2026-09-21T02:30`, `Europe/Oslo`), false)
})

test(`empty and invalid picker values never invent a date`, () => {
  assert.equal(ruleDateInput(``, `UTC`), ``)
  assert.equal(ruleDateValue(``, `UTC`, `2026-09-21T12:30:00Z`), ``)
  for (const value of [`2026-02-30T12:00`, `invalid`, `2026-09-21T25:00`]) assert.throws(() => ruleDateValue(value, `UTC`), RangeError)
  assert.throws(() => ruleDateValue(`2026-09-21T12:00`, `Unknown/Zone`), RangeError)
})

test(`UTC clock schedules display locally without changing their stored clock or UTC day boundaries`, () => {
  assert.equal(ruleClockInput(`21:30`, `Europe/Oslo`, `2026-09-21`), `23:30`)
  assert.equal(ruleClockValue(`23:30`, `Europe/Oslo`, `2026-09-21`, `21:30`), `21:30`)
  assert.equal(ruleClockValue(`01:30`, `Europe/Oslo`, `2026-09-21`), `23:30`)
  assert.equal(ruleClockInput(`21:30`, `Europe/Oslo`, `2026-01-21`), `22:30`)
  assert.deepEqual(ruleClockBounds(`Europe/Oslo`, `2026-09-21`), { start: `02:00`, end: `02:00` })
  assert.deepEqual(ruleClockBounds(`Europe/Oslo`, `2026-10-25`), { start: `02:00`, end: `01:00` })
  assert.equal(ruleClockValue(`02:30`, `Europe/Oslo`, `2026-10-25`, `01:30`), `01:30`)
  assert.equal(ruleClockValue(``, `Europe/Oslo`, `2026-09-21`, `21:30`), ``)
})

test(`new daily clock selections choose the first occurrence independently of the old value`, () => {
  for (const previous of [``, `12:00`, `23:00`]) assert.equal(ruleClockValue(`02:30`, `Europe/Oslo`, `2026-10-25`, previous), `00:30`)
  assert.throws(() => ruleClockValue(`02:30`, `Europe/Oslo`, `2026-03-29`), RangeError)
  assert.equal(repeatedRuleClock(`02:30`, `Europe/Oslo`, `2026-10-25`), true)
  assert.equal(repeatedRuleClock(`02:30`, `Europe/Oslo`, `2026-09-21`), false)
})
