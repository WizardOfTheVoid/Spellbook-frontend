import assert from 'node:assert/strict'
import test from 'node:test'
import { canExecuteForPlayer, playerActionBlockReason } from './offenseDispatch'

test(`immediate actions require a fresh roster containing the player on the selected server`, context => {
  const snapshot = { gameServerId: 2, observedAt: `2026-09-19T12:00:00Z`, players: [{ playfabId: `PLAYER` }] }
  const now = Date.parse(`2026-09-19T12:00:10Z`)
  context.mock.timers.enable({ apis: [`Date`], now })
  assert.equal(canExecuteForPlayer(snapshot, `PLAYER`, 2, now), true)
  assert.equal(canExecuteForPlayer(snapshot, `PLAYER`, 3, now), false)
  assert.equal(canExecuteForPlayer(snapshot, `OTHER`, 2, now), false)
  assert.equal(canExecuteForPlayer(snapshot, `PLAYER`, 2, now + 6000), false)
  assert.equal(canExecuteForPlayer(null, `PLAYER`, 2, now), false)
})

test(`a roster arriving between UI clock ticks immediately permits its current player`, context => {
  context.mock.timers.enable({ apis: [`Date`], now: Date.parse(`2026-10-18T20:46:01.900Z`) })
  const snapshot = { gameServerId: 1390, observedAt: `2026-10-18T20:46:01.696Z`, players: [{ playfabId: `PLAYER` }] }
  assert.equal(canExecuteForPlayer(snapshot, `PLAYER`, 1390, Date.parse(`2026-10-18T20:46:01Z`)), true)
  assert.equal(canExecuteForPlayer(snapshot, `OTHER`, 1390, Date.parse(`2026-10-18T20:46:01Z`)), false)
  assert.equal(canExecuteForPlayer(snapshot, `PLAYER`, 2, Date.parse(`2026-10-18T20:46:01Z`)), false)
})

test(`a roster expiring between UI clock ticks stops permitting actions`, context => {
  context.mock.timers.enable({ apis: [`Date`], now: Date.parse(`2026-10-18T20:46:15.100Z`) })
  const snapshot = { gameServerId: 1390, observedAt: `2026-10-18T20:46:00Z`, players: [{ playfabId: `PLAYER` }] }
  assert.equal(canExecuteForPlayer(snapshot, `PLAYER`, 1390, Date.parse(`2026-10-18T20:46:14.500Z`)), false)
})

test(`future and invalid roster timestamps never permit actions`, context => {
  context.mock.timers.enable({ apis: [`Date`], now: Date.parse(`2026-10-18T20:46:01Z`) })
  const snapshot = { gameServerId: 1390, observedAt: `2026-10-18T20:46:01.001Z`, players: [{ playfabId: `PLAYER` }] }
  assert.equal(canExecuteForPlayer(snapshot, `PLAYER`, 1390), false)
  assert.equal(canExecuteForPlayer({ ...snapshot, observedAt: `invalid` }, `PLAYER`, 1390), false)
})

test(`action denials distinguish missing players from unavailable or stale roster data`, context => {
  context.mock.timers.enable({ apis: [`Date`], now: Date.parse(`2026-10-18T20:46:16Z`) })
  const snapshot = { gameServerId: 1390, observedAt: `2026-10-18T20:46:15Z`, players: [{ playfabId: `PLAYER` }] }
  const cases = [
    { snapshot, playfabId: `PLAYER`, serverId: 1390, reason: null },
    { snapshot, playfabId: `OTHER`, serverId: 1390, reason: `playerAbsent` },
    { snapshot: { ...snapshot, observedAt: `2026-10-18T20:46:00Z` }, playfabId: `PLAYER`, serverId: 1390, reason: `rosterStale` },
    { snapshot: null, playfabId: `PLAYER`, serverId: 1390, reason: `noCurrentServer` },
    { snapshot, playfabId: `PLAYER`, serverId: 2, reason: `serverChanged` }
  ]
  for (const entry of cases) {
    assert.equal(playerActionBlockReason(entry.snapshot, entry.playfabId, entry.serverId), entry.reason)
  }
})
