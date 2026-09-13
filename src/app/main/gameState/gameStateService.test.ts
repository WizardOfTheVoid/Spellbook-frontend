import assert from 'node:assert/strict'
import test from 'node:test'
import { setImmediate as settle } from 'node:timers/promises'
import { GameStateService } from './gameStateService'
import { CurrentGameSnapshotStore, type CurrentGameSnapshotInput } from '../services/currentGameSnapshotStore'
import type { CoreCallResult, ListPlayersSnapshot } from '../types'

const meta = (running: boolean, focused = true): CoreCallResult => ({ ok: true, status: 200, statusText: `OK`,
  data: { ok: true, data: { gameRunning: running, focus: { gameIsFocused: focused } } } })
const candidate = (): CurrentGameSnapshotInput => ({ observedAt: new Date().toISOString(), gameServerId: 1,
  externalId: `one`, serverName: `Duel`, serverAddress: `192.0.2.1:7777`, parseWarnings: [], players: [] })
const observation = (serverName = `Duel`, playerCount = 0, serverAddress = `192.0.2.1:7777`): ListPlayersSnapshot => ({
  serverName, serverAddress, rawText: `output`, rawLines: [], parseWarnings: [],
  players: Array.from({ length: playerCount }, (_, index) => ({ index, name: `Player`, playfabId: `P${index}`, rawLine: `row` }))
})

test(`stopping the game clears the roster; focus changes preserve it; unknown Core closes gates without inventing a departure`, async () => {
  let result = meta(true)
  const snapshots = new CurrentGameSnapshotStore()
  const game = new GameStateService({ callCore: async () => result }, snapshots)
  await game.refresh()
  game.accept({ observation: observation(), candidate: candidate() }, snapshots.invalidationVersion)
  const previous = snapshots.get()
  assert.equal(game.isInGameServer(), true)
  result = meta(true, false)
  await game.refresh()
  assert.equal(game.isGameFocused(), false)
  assert.equal(snapshots.get(), previous)
  result = { ok: false, status: 0, statusText: `offline`, data: null }
  await game.refresh()
  assert.equal(game.isGameRunning(), false)
  assert.equal(game.get().available, false)
  assert.equal(snapshots.get(), previous)
  result = meta(false)
  await game.refresh()
  assert.equal(game.get().available, true)
  assert.equal(snapshots.get(), null)
})

test(`Main Menu survives clearing the roster and a subsequent server observation restores server gates`, async () => {
  const snapshots = new CurrentGameSnapshotStore()
  const game = new GameStateService({ callCore: async () => meta(true) }, snapshots)
  await game.refresh()
  game.accept({ observation: observation(), candidate: candidate() }, snapshots.invalidationVersion)
  game.accept({ observation: observation(`Hastings`, 1) }, snapshots.invalidationVersion)
  assert.equal(snapshots.get(), null)
  assert.equal(game.isMainMenu(), true)
  assert.equal(game.isInGameServer(), false)
  await game.refresh()
  assert.equal(game.isMainMenu(), true)
  game.accept({ observation: observation(), candidate: candidate() }, snapshots.invalidationVersion)
  assert.equal(game.isMainMenu(), false)
  assert.equal(game.isInGameServer(), true)
})

test(`changed server observations clear old data even when backend ingestion fails`, async () => {
  const snapshots = new CurrentGameSnapshotStore()
  const game = new GameStateService({ callCore: async () => meta(true) }, snapshots)
  await game.refresh()
  game.accept({ observation: observation(), candidate: candidate() }, snapshots.invalidationVersion)
  game.accept({ observation: observation(`Another`, 4, `192.0.2.2:7777`) }, snapshots.invalidationVersion)
  assert.equal(snapshots.get(), null)
  assert.equal(game.isInGameServer(), false)
})

test(`late ListPlayers cannot restore a snapshot after confirmed game exit or logout`, async () => {
  let running = true
  const snapshots = new CurrentGameSnapshotStore()
  const game = new GameStateService({ callCore: async () => meta(running) }, snapshots)
  await game.refresh()
  const revision = snapshots.invalidationVersion
  running = false
  await game.refresh()
  running = true
  await game.refresh()
  game.accept({ observation: observation(), candidate: candidate() }, revision)
  assert.equal(snapshots.get(), null)
  game.accept({ observation: observation(), candidate: candidate() }, snapshots.invalidationVersion)
  snapshots.clear()
  assert.equal(game.isInGameServer(), false)
  assert.equal(game.get().map, null)
})

test(`read-only monitoring keeps detecting game exit without renderer polling`, async context => {
  context.mock.timers.enable({ apis: [`setInterval`] })
  let running = true
  let calls = 0
  const snapshots = new CurrentGameSnapshotStore()
  const game = new GameStateService({ callCore: async () => {
    calls++
    return meta(running)
  } }, snapshots)
  game.start()
  await settle()
  game.accept({ observation: observation(), candidate: candidate() }, snapshots.invalidationVersion)
  running = false
  context.mock.timers.tick(2_000)
  await settle()
  assert.equal(game.isGameRunning(), false)
  assert.equal(snapshots.get(), null)
  game.stop()
  context.mock.timers.tick(10_000)
  await settle()
  assert.equal(calls, 2)
})

test(`a delayed stopped-game metadata response cannot clear a newer server observation`, async () => {
  let resolve!: (result: CoreCallResult) => void
  let calls = 0
  const waiting = new Promise<CoreCallResult>(accept => { resolve = accept })
  const snapshots = new CurrentGameSnapshotStore()
  const game = new GameStateService({ callCore: async () => ++calls === 1 ? meta(true) : waiting }, snapshots)
  await game.refresh()
  const pending = game.refresh()
  game.accept({ observation: observation(), candidate: candidate() }, snapshots.invalidationVersion)
  resolve(meta(false))
  await pending
  assert.equal(game.isInGameServer(), true)
  assert.notEqual(snapshots.get(), null)
})
