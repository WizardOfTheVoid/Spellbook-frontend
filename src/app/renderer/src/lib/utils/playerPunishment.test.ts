import assert from 'node:assert/strict'
import test from 'node:test'
import { extractDbPlayers } from './dbPlayers'
import { createDbPlayerState } from './playerStateData'
import { playerPunishmentStatus } from './playerPunishment'

const now = Date.parse(`2026-09-06T12:00:00Z`)
const punishment = {
  id: 4, actionType: `warn` as const, offenseType: `griefing`, reason: `Team killing`,
  createdAt: `2026-09-06T11:00:00Z`, expiresAt: null
}

test(`every active ban takes red precedence over a more recent warning`, () => {
  for (const offenseType of [`hacker`, `griefing`]) {
    const status = playerPunishmentStatus({
      activeBan: { ...punishment, actionType: `ban`, offenseType, createdAt: `2026-08-01T00:00:00Z` },
      latestPunishment: punishment
    }, now)
    assert.equal(status.outlineTone, `danger`)
    assert.match(status.tooltip, /Banned/u)
    assert.match(status.tooltip, /Permanent/u)
    assert.match(status.tooltip, /Team killing/u)
    assert.match(status.tooltip, /Issued/u)
  }
})

test(`recent punishment is yellow only within the seven-day window`, () => {
  for (const [createdAt, expected] of [
    [`2026-08-30T12:00:00Z`, `warning`],
    [`2026-08-30T11:59:59Z`, null],
    [`2026-09-06T12:00:01Z`, null]
  ] as const) {
    assert.equal(playerPunishmentStatus({ latestPunishment: { ...punishment, createdAt } }, now).outlineTone, expected)
  }
  assert.deepEqual(playerPunishmentStatus({}, now), { outlineTone: null, tooltip: `` })
})

test(`an expired cached ban becomes yellow without its legacy flag keeping it red`, () => {
  const ban = { ...punishment, actionType: `ban` as const, expiresAt: `2026-09-06T11:59:59Z` }
  const status = playerPunishmentStatus({ activeBan: ban, latestPunishment: ban, activeBanKind: `hacker` }, now)
  assert.equal(status.outlineTone, `warning`)
  assert.match(status.tooltip, /Ban/u)
  assert.match(status.tooltip, /Expired/u)
  assert.equal(playerPunishmentStatus({ activeBanKind: `other` }, now).outlineTone, `danger`)
})

test(`player normalization and state merging retain punishment details and clear an unban`, () => {
  const [player] = extractDbPlayers([{ id: 12, playfabId: `P12`, activeBan: null, latestPunishment: punishment }])
  const state = createDbPlayerState(player)
  assert.equal(state.activeBan, null)
  assert.deepEqual(state.latestPunishment, punishment)
  assert.equal(playerPunishmentStatus(state, now).outlineTone, `warning`)
})
