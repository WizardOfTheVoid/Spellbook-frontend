import assert from 'node:assert/strict'
import test from 'node:test'
import { estimateCheaterMoney, parseDashboardQuery, parseDashboardTimelineQuery, parseDashboardPresence } from './dashboard.js'

test(`prices accounts at 4.73 dollars within the whole-dollar dashboard contract`, () => {
  assert.equal(estimateCheaterMoney(0), 0)
  assert.equal(estimateCheaterMoney(3), 14)
  assert.equal(estimateCheaterMoney(100), 473)
})

test(`dashboard defaults and combined team scope reject caller-selected teams`, () => {
  assert.deepEqual(parseDashboardQuery({}), { environment: `global`, period: `allTime`, timeline: `playerActions` })
  assert.equal(parseDashboardQuery({ period: `30Days` }).period, `30Days`)
  assert.equal(parseDashboardQuery({ environment: `team` }).environment, `team`)
  for (const input of [{ environment: `other` }, { period: `month` }, { timeline: [] }, { teamId: 3 }, null]) {
    assert.throws(() => parseDashboardQuery(input), RangeError)
  }
})

test(`timeline detail and presence validate bounded numeric and identity inputs`, () => {
  assert.equal(parseDashboardTimelineQuery({ start: `100`, end: `200`, maxBuckets: `120` }).maxBuckets, 120)
  for (const input of [{ start: 200, end: 100 }, { start: 0, end: 1, maxBuckets: 1000 }]) {
    assert.throws(() => parseDashboardTimelineQuery(input), RangeError)
  }
  assert.equal(parseDashboardPresence({ instanceId: `reporter-1`, sequence: 3, gameServerId: null }).gameServerId, null)
  for (const input of [{ instanceId: `x`, sequence: -1, gameServerId: 3 }, { instanceId: `x`, sequence: 1, gameServerId: 0 }, { instanceId: `x`, sequence: 1, gameServerId: 3, userId: 7 }]) {
    assert.throws(() => parseDashboardPresence(input), RangeError)
  }
})
