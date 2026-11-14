import assert from 'node:assert/strict'
import test from 'node:test'
import { isPlayerActionSnapshotFresh } from './playerActionFreshness'

test(`manual player action snapshots are fresh below 60 seconds`, () => {
  const capturedAt = Date.parse(`2026-10-25T06:00:00Z`)
  const observedAt = new Date(capturedAt).toISOString()
  for (const age of [0, 15_000, 25_000, 59_999]) assert.equal(isPlayerActionSnapshotFresh(observedAt, capturedAt + age), true)
  for (const age of [60_000, 60_001, -1]) assert.equal(isPlayerActionSnapshotFresh(observedAt, capturedAt + age), false)
  assert.equal(isPlayerActionSnapshotFresh(`invalid`, capturedAt), false)
})
