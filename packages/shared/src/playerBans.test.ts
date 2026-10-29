import assert from 'node:assert/strict'
import test from 'node:test'
import { isPlayerBanActive, repeatedBanCommandIssue } from './playerBans'

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

test(`an earlier linked unban does not lift a newly reapplied Wanted ban`, () => {
  const unban = { ...ban, id: 2, actionType: `unban`, relatedActionId: ban.id, createdAt: `2026-09-19T11:00:00Z` }
  assert.equal(isPlayerBanActive(ban, [unban], now), false)
  assert.equal(isPlayerBanActive({ ...ban, duration: null, createdAt: `2026-09-19T11:30:00Z` }, [unban], now), true)
})

test(`one recipe cannot repeat an identical ban but may repeat unban or contain distinct bans`, () => {
  const command = { commandType: `ban` as const, offenseType: `ffa`, durationHours: 4, message: `Ban`, sortOrder: 0, delayMs: 0 }
  assert.ok(repeatedBanCommandIssue([command, { ...command, message: `Different message` }]))
  assert.equal(repeatedBanCommandIssue([command, { ...command, durationHours: 5 }]), null)
  const unban = { ...command, commandType: `unban` as const }
  assert.equal(repeatedBanCommandIssue([unban, unban]), null)
})
