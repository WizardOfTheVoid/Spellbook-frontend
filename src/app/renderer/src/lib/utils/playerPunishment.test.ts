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

test(`every active ban takes precedence over a more recent warning`, () => {
  for (const [offenseType, expected] of [[`hacker`, `cheatingBan`], [`griefing`, `ban`]] as const) {
    const status = playerPunishmentStatus({
      activeBan: { ...punishment, actionType: `ban`, offenseType, createdAt: `2026-08-01T00:00:00Z` },
      latestPunishment: punishment
    }, now)
    assert.equal(status.state, expected)
    assert.match(status.tooltip, /Banned/u)
    assert.match(status.tooltip, /Permanent/u)
    assert.match(status.tooltip, /Team killing/u)
    assert.match(status.tooltip, /Issued/u)
  }
})

test(`recent punishment applies only within the seven-day window`, () => {
  for (const [createdAt, expected] of [
    [`2026-08-30T12:00:00Z`, `offense`],
    [`2026-08-30T11:59:59Z`, null],
    [`2026-09-06T12:00:01Z`, null]
  ] as const) {
    assert.equal(playerPunishmentStatus({ latestPunishment: { ...punishment, createdAt } }, now).state, expected)
  }
  assert.deepEqual(playerPunishmentStatus({}, now), { state: null, tooltip: `` })
})

test(`an expired cached ban becomes yellow without its legacy flag keeping it red`, () => {
  const ban = { ...punishment, actionType: `ban` as const, expiresAt: `2026-09-06T11:59:59Z` }
  const status = playerPunishmentStatus({ activeBan: ban, latestPunishment: ban, activeBanKind: `hacker` }, now)
  assert.equal(status.state, `ban`)
  assert.match(status.tooltip, /Ban/u)
  assert.match(status.tooltip, /Expired/u)
  assert.equal(playerPunishmentStatus({ activeBanKind: `other` }, now).state, `otherBan`)
})

test(`player normalization and state merging retain punishment details and clear an unban`, () => {
  const [player] = extractDbPlayers([{ id: 12, playfabId: `P12`, activeBan: null, latestPunishment: punishment }])
  const state = createDbPlayerState(player)
  assert.equal(state.activeBan, null)
  assert.deepEqual(state.latestPunishment, punishment)
  assert.equal(playerPunishmentStatus(state, now).state, `offense`)
})

test(`wanted outranks an active cheating ban outside the Wanted list`, () => {
  const status = playerPunishmentStatus({
    isWanted: true,
    activeBanKind: `hacker`,
    activeBan: { ...punishment, actionType: `ban` }
  }, now)
  assert.equal(status.state, `wanted`)
  assert.equal(status.tooltip, `Player is wanted`)
})

test(`active ban kind distinguishes cheating from other bans`, () => {
  const ban = { ...punishment, actionType: `ban` as const }
  assert.equal(playerPunishmentStatus({ activeBan: ban, activeBanKind: `hacker` }, now).state, `cheatingBan`)
  assert.equal(playerPunishmentStatus({ activeBan: ban, activeBanKind: `other` }, now).state, `otherBan`)
  assert.equal(playerPunishmentStatus({ activeBan: ban }, now).state, `ban`)
})

test(`active Low Level bans have a distinct row state`, () => {
  const ban = { ...punishment, actionType: `ban` as const, offenseType: `low_level` }
  assert.equal(playerPunishmentStatus({ activeBan: ban, activeBanKind: `other` }, now).state, `lowLevelBan`)
})

test(`a stronger recent kick outranks a newer warning`, () => {
  const kick = { ...punishment, id: 3, actionType: `kick` as const, createdAt: `2026-09-05T11:00:00Z` }
  const status = playerPunishmentStatus({ strongestRecentPunishment: kick, latestPunishment: punishment }, now)
  assert.equal(status.state, `kick`)
  assert.match(status.tooltip, /Kick/u)
})

test(`player state retains the strongest recent punishment from the list response`, () => {
  const kick = { ...punishment, id: 3, actionType: `kick` as const }
  const [player] = extractDbPlayers([{ id: 12, playfabId: `P12`, strongestRecentPunishment: kick }])
  const state = createDbPlayerState(player)
  assert.deepEqual(state.strongestRecentPunishment, kick)
})
