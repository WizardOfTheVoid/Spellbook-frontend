import assert from 'node:assert/strict'
import test from 'node:test'
import { accountStatus, accountStatusLabel } from './accountStatus'

test(`derives the three account lifecycle states without treating approval as suspension`, () => {
  assert.equal(accountStatus({ isActive: true, bannedAt: null }), `enabled`)
  assert.equal(accountStatus({ isActive: false, bannedAt: null }), `awaitingApproval`)
  assert.equal(accountStatus({ isActive: false, bannedAt: `2026-09-04T10:00:00.000Z` }), `suspended`)
  assert.equal(accountStatusLabel(`awaitingApproval`), `Awaiting approval`)
  assert.equal(accountStatusLabel(`suspended`), `Suspended`)
})
