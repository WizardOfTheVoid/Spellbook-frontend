import assert from 'node:assert/strict'
import test from 'node:test'
import { initialGameState, createGameChecks, type GameState } from './gameState'

test(`game gates require running metadata and exactly one Hastings player for Main Menu`, () => {
  let state: GameState = { ...initialGameState, available: true, running: true, focused: true, map: `Hastings`, playerCount: 1 }
  const checks = createGameChecks(() => state)
  assert.equal(checks.isGameRunning(), true)
  assert.equal(checks.isGameFocused(), true)
  assert.equal(checks.isMainMenu(), true)
  assert.equal(checks.isInGameServer(), false)
  for (const playerCount of [0, 2]) {
    state = { ...state, playerCount }
    assert.equal(checks.isMainMenu(), false)
  }
  state = { ...state, map: `Duel`, connected: true }
  assert.equal(checks.isInGameServer(), true)
  state = { ...state, running: false }
  assert.ok(Object.values(checks).every(check => !check()))
  state = { ...state, running: true, available: false }
  assert.ok(Object.values(checks).every(check => !check()))
})
