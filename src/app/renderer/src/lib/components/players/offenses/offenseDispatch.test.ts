import assert from 'node:assert/strict'
import test from 'node:test'
import { canExecuteForPlayer } from './offenseDispatch'

test(`immediate actions require a fresh roster containing the player on the selected server`, () => {
  const snapshot = { gameServerId: 2, observedAt: `2026-09-19T12:00:00Z`, players: [{ playfabId: `PLAYER` }] }
  const now = Date.parse(`2026-09-19T12:00:10Z`)
  assert.equal(canExecuteForPlayer(snapshot, `PLAYER`, 2, now), true)
  assert.equal(canExecuteForPlayer(snapshot, `PLAYER`, 3, now), false)
  assert.equal(canExecuteForPlayer(snapshot, `OTHER`, 2, now), false)
  assert.equal(canExecuteForPlayer(snapshot, `PLAYER`, 2, now + 6000), false)
  assert.equal(canExecuteForPlayer(null, `PLAYER`, 2, now), false)
})
