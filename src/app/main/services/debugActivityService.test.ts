import assert from 'node:assert/strict'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { DebugActivityService } from './debugActivityService'
import type { GameActivitySnapshot } from '../../shared/gameActivity'

test(`Debug polls live state only when enabled and clears unavailable values`, async () => {
  const timer = { callback: null as (() => void) | null }
  const tick = (): void => {
    const callback = timer.callback
    timer.callback = null
    callback?.()
  }
  let calls = 0
  let fail = false
  const updates: Array<GameActivitySnapshot | null> = []
  const visibility: boolean[] = []
  const movement = { available: true, isMoving: false, isChatting: true,
    timeSinceMovementMs: 2000, timeSinceChattingMs: 2000, chatCooldownRemainingMs: 23000 }
  const service = new DebugActivityService({ callCore: async () => {
    calls += 1
    await setImmediate()
    if (fail) throw new Error(`offline`)
    return { ok: true, status: 200, statusText: `OK`, data: { ok: true, data: { movement } } }
  } }, {
    setEnabled: enabled => visibility.push(enabled),
    update: value => updates.push(value)
  }, {
    setTimeout: (next, ms) => { assert.equal(ms, 250); timer.callback = next; return 1 },
    clearTimeout: () => { timer.callback = null }
  })
  service.setEnabled(false)
  assert.equal(calls, 0)
  service.setEnabled(true)
  service.setEnabled(true)
  await setImmediate()
  assert.equal(calls, 1)
  assert.deepEqual(updates.at(-1), movement)
  fail = true
  tick()
  await setImmediate()
  assert.equal(updates.at(-1), null)
  fail = false
  tick()
  service.setEnabled(false)
  await setImmediate()
  assert.equal(updates.at(-1), null)
  assert.equal(timer.callback, null)
  assert.equal(visibility.at(-1), false)
})
