import assert from 'node:assert/strict'
import test from 'node:test'
import { readActivity } from './gameActivitySnapshot'
import type { CoreCallResult } from '../types'

const status = () => ({
  runtime: { enabled: true, gameRunning: true, appRunning: true },
  focus: { gameFocused: true, appFocused: false, gameReady: true, overlayState: `unknown`, limitation: `Steam unverified` },
  input: { available: true, keyboardActive: false, mouseActive: true, idleMs: 2000, isChatting: false, chatCooldownRemainingMs: 0 },
  execution: { canExecuteCommand: true },
  queue: { state: `paused`, pendingActions: 2, id: `test`, author: `user`, priority: `high`, cursor: 1, commandCount: 3, remainingMs: 5000,
    lastResult: { id: `previous`, status: `completed`, sentCommands: 2 } },
  lastCommand: { command: `ListPlayers`, timeSinceMs: 1200 }
})
const envelope = (data: unknown): CoreCallResult => ({ ok: true, status: 200, statusText: `OK`, data: { ok: true, data } })

test(`Debug activity normalizes omitted nulls without overriding Core's effective decision`, () => {
  const value = readActivity(envelope(status()), 60000)!
  assert.equal(value.execution.canExecuteCommand, true)
  assert.equal(value.execution.reason, null)
  assert.equal(value.input.timeSinceChattingMs, null)
  assert.equal(value.queue.lastResult?.errorCode, null)
  assert.equal(value.queue.cursor, 1)
  assert.equal(value.focus.overlayState, `unknown`)
  assert.equal(value.focus.limitation, `Steam unverified`)
  assert.equal(value.isMoving, true)
  assert.equal(value.isAfk, false)
  assert.deepEqual(value.lastCommand, { command: `ListPlayers`, timeSinceMs: 1200 })
})

test(`Unavailable physical monitoring retains process diagnostics but never claims AFK`, () => {
  const data = status()
  data.input.available = false
  data.input.idleMs = 100000
  const value = readActivity(envelope(data), 60000)!
  assert.equal(value.runtime.enabled, true)
  assert.equal(value.available, false)
  assert.equal(value.isAfk, false)
})

test(`Failed or malformed snapshots produce unavailable activity`, () => {
  for (const value of [null, {}, { ...status(), input: null }, { ...status(), queue: { cursor: -1 } }]) {
    assert.equal(readActivity(envelope(value), 60000), null)
  }
  assert.equal(readActivity({ ...envelope(status()), ok: false }, 60000), null)
})

test(`Command history preserves repeated commands and rejects malformed entries`, () => {
  const recentCommands = [
    { command: `Serversay hello`, timeSinceMs: 0 },
    { command: `ListPlayers`, timeSinceMs: 1000 },
    { command: `ListPlayers`, timeSinceMs: 2000 }
  ]
  assert.deepEqual(readActivity(envelope({ ...status(), recentCommands }), 60000)?.recentCommands, recentCommands)
  for (const history of [42, [null], [{ command: `ListPlayers`, timeSinceMs: -1 }]]) {
    assert.equal(readActivity(envelope({ ...status(), recentCommands: history }), 60000), null)
  }
})

test(`Older Core snapshots fall back to the last command or an empty history`, () => {
  assert.deepEqual(readActivity(envelope(status()), 60000)?.recentCommands, [status().lastCommand])
  assert.deepEqual(readActivity(envelope({ ...status(), lastCommand: null }), 60000)?.recentCommands, [])
})

test(`AFK requires a running focused game and released physical input`, () => {
  const data = status()
  data.input.idleMs = 60000
  data.input.mouseActive = false
  assert.equal(readActivity(envelope(data), 60000)?.isAfk, true)
  for (const changed of [
    { ...data, runtime: { ...data.runtime, gameRunning: false } },
    { ...data, focus: { ...data.focus, gameFocused: false } },
    { ...data, input: { ...data.input, keyboardActive: true } },
    { ...data, input: { ...data.input, mouseActive: true } }
  ]) assert.equal(readActivity(envelope(changed), 60000)?.isAfk, false)
})
