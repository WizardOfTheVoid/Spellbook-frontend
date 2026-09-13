import assert from 'node:assert/strict'
import test from 'node:test'
import { GameStateIpc } from './gameStateIpc'
import { GameStateService } from './gameStateService'
import { CurrentGameSnapshotStore } from '../services/currentGameSnapshotStore'
import type { IpcMain } from 'electron'

test(`metadata and renderer refresh use the same game status and publish changes`, async () => {
  const calls: string[] = []
  const game = new GameStateService({ callCore: async path => {
    calls.push(path)
    return { ok: true, status: 200, statusText: `OK`, data: { ok: true, data: { gameRunning: true } } }
  } }, new CurrentGameSnapshotStore())
  const handlers = new Map<string, () => unknown>()
  const events: unknown[] = []
  new GameStateIpc({ handle: (name: string, handler: () => unknown) => { handlers.set(name, handler) } } as unknown as IpcMain,
    game, { sendToCurrent: (name, payload) => {
      events.push([name, payload])
      return true
    } }).register()
  await handlers.get(`core:meta`)!()
  assert.equal(game.isGameRunning(), true)
  assert.deepEqual(handlers.get(`core:gameState`)!(), game.get())
  assert.deepEqual(await handlers.get(`core:refreshGameState`)!(), game.get())
  assert.deepEqual(calls, [`/v2/meta/get`, `/v2/meta/get`])
  assert.deepEqual(events, [[`core:gameStateChanged`, game.get()]])
})
