import assert from 'node:assert/strict'
import test from 'node:test'
import { get } from 'svelte/store'
import { createGameStateStore } from './gameStateStore'
import { initialGameState, type GameState } from '../../../../shared/gameState'
import { setImmediate as settle } from 'node:timers/promises'

test(`renderer gates follow Main events and remove listeners when its session ends`, async () => {
  let listener: (state: GameState) => void = () => {}
  let removed = false
  const state = { ...initialGameState, version: 1, available: true, running: true, focused: true }
  const store = createGameStateStore(() => ({ gameState: async () => state, refreshGameState: async () => state,
    onGameStateChanged: next => {
      listener = next
      return () => { removed = true }
    } }))
  store.sync(true)
  await settle()
  assert.equal(store.isGameRunning(), true)
  assert.equal(store.isGameFocused(), true)
  listener({ ...state, version: 2, map: `Hastings`, playerCount: 1 })
  assert.equal(store.isMainMenu(), true)
  assert.equal(store.isInGameServer(), false)
  listener({ ...state, version: 3, running: false })
  assert.equal(store.isGameRunning(), false)
  store.sync(false)
  assert.equal(removed, true)
  listener({ ...state, version: 4 })
  assert.equal(get(store).available, false)
})

test(`a delayed hydration cannot overwrite a newer stop event`, async () => {
  let listener: (state: GameState) => void = () => {}
  let resolve!: (state: GameState) => void
  const pending = new Promise<GameState>(accept => { resolve = accept })
  const store = createGameStateStore(() => ({ gameState: async () => pending, refreshGameState: async () => pending,
    onGameStateChanged: next => {
      listener = next
      return () => {}
    } }))
  store.sync(true)
  listener({ ...initialGameState, version: 9, available: true })
  resolve({ ...initialGameState, version: 8, available: true, running: true })
  await settle()
  assert.equal(store.isGameRunning(), false)
  assert.equal(get(store).version, 9)
})
