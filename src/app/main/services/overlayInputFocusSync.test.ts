import assert from 'node:assert/strict'
import test from 'node:test'
import type { CoreCallResult } from '../types'
import { OverlayInputFocusSync } from './overlayInputFocusSync'

const app = { processId: 11, windowHandle: `0x1` }
const ok = { ok: true } as CoreCallResult
const failed = { ok: false } as CoreCallResult
const settle = async () => { for (let turn = 0; turn < 6; turn++) await Promise.resolve() }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

test(`sends immediately, coalesces pending changes and stays idle after success`, async context => {
  context.mock.timers.enable({ apis: [`setTimeout`] })
  const calls: { body: { app: typeof app, sequence: number, inputFocused: boolean }, done: ReturnType<typeof deferred<CoreCallResult>> }[] = []
  const sync = new OverlayInputFocusSync({ callCore: async (path, init) => {
    assert.equal(path, `/v3/runtime/app/input-focus`)
    assert.equal(init?.method, `POST`)
    const done = deferred<CoreCallResult>()
    calls.push({ body: JSON.parse(init!.body as string), done })
    return done.promise
  } }, () => app)
  context.after(() => sync.stop())
  sync.publish(true)
  assert.deepEqual(calls[0].body, { app, sequence: 1, inputFocused: true })
  sync.publish(false)
  sync.publish(true)
  sync.publish(false)
  assert.equal(calls.length, 1)
  calls[0].done.resolve(ok)
  await settle()
  assert.equal(calls.length, 2)
  assert.equal(calls[1].body.inputFocused, false)
  assert.ok(calls[1].body.sequence > calls[0].body.sequence)
  calls[1].done.resolve(ok)
  await settle()
  sync.publish(false)
  context.mock.timers.tick(60_000)
  assert.equal(calls.length, 2)
  sync.publish(false, true)
  assert.equal(calls.length, 3)
  calls[2].done.resolve(ok)
})

test(`failed delivery retries after 250ms and a new change bypasses that wait`, async context => {
  context.mock.timers.enable({ apis: [`setTimeout`] })
  const sent: boolean[] = []
  const sync = new OverlayInputFocusSync({ callCore: async (_path, init) => {
    sent.push(JSON.parse(init!.body as string).inputFocused)
    return sent.length < 3 ? failed : ok
  } }, () => app)
  context.after(() => sync.stop())
  sync.publish(true)
  await settle()
  context.mock.timers.tick(249)
  assert.deepEqual(sent, [true])
  context.mock.timers.tick(1)
  await settle()
  assert.deepEqual(sent, [true, true])
  sync.publish(false)
  assert.deepEqual(sent, [true, true, false])
  await settle()
  context.mock.timers.tick(10_000)
  assert.equal(sent.length, 3)
})

test(`a hung request is aborted after 250ms and the newest state is delivered next`, async context => {
  context.mock.timers.enable({ apis: [`setTimeout`] })
  const hung = deferred<CoreCallResult>()
  const signals: AbortSignal[] = []
  const sent: boolean[] = []
  const sync = new OverlayInputFocusSync({ callCore: async (_path, init) => {
    sent.push(JSON.parse(init!.body as string).inputFocused)
    signals.push(init!.signal!)
    if (sent.length !== 1) return ok
    init!.signal!.addEventListener(`abort`, () => hung.resolve(failed), { once: true })
    return hung.promise
  } }, () => app)
  context.after(() => sync.stop())
  sync.publish(true)
  sync.publish(false)
  context.mock.timers.tick(249)
  assert.equal(signals[0].aborted, false)
  context.mock.timers.tick(1)
  await settle()
  assert.equal(signals[0].aborted, true)
  assert.deepEqual(sent, [true, false])
})

test(`shutdown aborts in-flight delivery and prevents retries or later publications`, async context => {
  context.mock.timers.enable({ apis: [`setTimeout`] })
  let calls = 0
  let signal: AbortSignal | undefined
  const pending = deferred<CoreCallResult>()
  const sync = new OverlayInputFocusSync({ callCore: async (_path, init) => {
    calls++
    signal = init!.signal!
    return pending.promise
  } }, () => app)
  sync.publish(true)
  sync.publish(false)
  sync.stop()
  assert.equal(signal?.aborted, true)
  pending.resolve(failed)
  await settle()
  context.mock.timers.tick(60_000)
  sync.publish(false, true)
  assert.equal(calls, 1)
})

test(`missing windows are not created and registration can force the current state to resend`, async () => {
  let current: typeof app | null = null
  const sent: boolean[] = []
  const sync = new OverlayInputFocusSync({ callCore: async (_path, init) => {
    sent.push(JSON.parse(init!.body as string).inputFocused)
    return ok
  } }, () => current)
  try {
    sync.publish(false)
    assert.deepEqual(sent, [])
    current = app
    sync.publish(false, true)
    assert.deepEqual(sent, [false])
    await settle()
  } finally { sync.stop() }
})
