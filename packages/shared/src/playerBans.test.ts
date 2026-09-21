import assert from 'node:assert/strict'
import test from 'node:test'
import { isPlayerBanActive, profileDuplicateBan } from './playerBans'

const now = new Date(`2026-09-19T12:00:00.000Z`)
const ban = { id: 1, actionType: `ban`, gameServerId: 4, createdAt: `2026-09-19T10:00:00.000Z`, duration: 4, expiresAt: null, relatedActionId: null }

test(`ban expires at its deadline and unrelated servers do not lift it`, () => {
  assert.equal(isPlayerBanActive(ban, [], now), true)
  assert.equal(isPlayerBanActive(ban, [], new Date(`2026-09-19T14:00:00Z`)), false)
  const unban = { ...ban, id: 2, actionType: `unban`, createdAt: `2026-09-19T11:00:00Z` }
  assert.equal(isPlayerBanActive(ban, [unban], now), false)
  assert.equal(isPlayerBanActive(ban, [{ ...unban, gameServerId: 5 }], now), true)
  assert.equal(isPlayerBanActive({ ...ban, createdAt: `2026-09-19T11:30:00Z` }, [unban], now), true)
})

test(`removing a record does not lift an active ban or erase a prior local unban`, () => {
  const removed = { ...ban, duration: null, removedAt: now.toISOString() }
  assert.equal(isPlayerBanActive(removed, [], now), true)
  assert.equal(isPlayerBanActive(removed, [{ ...ban, id: 2, actionType: `unban`, relatedActionId: 1, createdAt: `2026-09-19T11:00:00Z` }], now), false)
})

test(`duplicate commands match server, offense and duration until the exact expiry`, () => {
  const command = { commandType: `ban` as const, offenseType: `ffa`, durationHours: 4, message: `Different message`, sortOrder: 0, delayMs: 0 }
  const record = { ...ban, offenseType: `ffa` }
  assert.ok(profileDuplicateBan([command], [record], 4, now))
  assert.equal(profileDuplicateBan([command], [record], 4, new Date(`2026-09-19T14:00:00Z`)), null)
  assert.equal(profileDuplicateBan([command], [record], 5, now), null)
  assert.equal(profileDuplicateBan([{ ...command, durationHours: 8 }], [record], 4, now), null)
  assert.equal(profileDuplicateBan([{ ...command, offenseType: `other` }], [record], 4, now), null)
  assert.equal(profileDuplicateBan([{ ...command, commandType: `unban` }], [record], 4, now), null)
  assert.equal(profileDuplicateBan([command], [{ ...record, isActiveBan: false }], 4, now), null)
})

test(`permanent sentinel and hacker commands match permanent bans`, () => {
  const command = { commandType: `ban` as const, offenseType: `ffa`, durationHours: 999999, message: `Ban`, sortOrder: 0, delayMs: 0 }
  assert.ok(profileDuplicateBan([command], [{ ...ban, offenseType: `ffa`, duration: null }], 4, now))
  assert.ok(profileDuplicateBan([{ ...command, offenseType: `hacker`, durationHours: 4 }], [{ ...ban, offenseType: `hacker`, duration: null }], 4, now))
})

test(`one recipe cannot repeat an identical ban but may repeat unban or contain distinct bans`, () => {
  const command = { commandType: `ban` as const, offenseType: `ffa`, durationHours: 4, message: `Ban`, sortOrder: 0, delayMs: 0 }
  assert.ok(profileDuplicateBan([command, { ...command, message: `Different message` }], [], 4, now))
  assert.equal(profileDuplicateBan([command, { ...command, durationHours: 5 }], [], 4, now), null)
  const unban = { ...command, commandType: `unban` as const }
  assert.equal(profileDuplicateBan([unban, unban], [], 4, now), null)
})
