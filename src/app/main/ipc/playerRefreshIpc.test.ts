import assert from 'node:assert/strict'
import test from 'node:test'
import { CoreIpcHandlers } from './core-ipc-handlers'
import type { CoreCallResult } from '../types'

const channels = [`core:listPlayers`, `core:refreshCurrentGameSnapshot`]
const success: CoreCallResult = { ok: true, status: 200, statusText: `OK`, data: { players: [] } }

function fixture(refresh: () => Promise<CoreCallResult>, getIssue: () => string | null = () => null) {
  const handlers = new Map<string, () => Promise<CoreCallResult>>()
  new CoreIpcHandlers(
    { handle: (name: string, handler: () => Promise<CoreCallResult>) => handlers.set(name, handler) } as never,
    {} as never, {} as never, { refreshNow: refresh } as never,
    { subscribe: () => () => {} } as never, {} as never, {} as never, {} as never, {} as never,
    { check: async () => null }, getIssue
  ).register()
  return async (channel: string) => await handlers.get(channel)!()
}

test(`both player refresh channels return the recovery reason without calling the stopped poller`, async () => {
  let calls = 0
  const issue = `Caller-provided recovery guidance`
  const invoke = fixture(async () => { calls++; throw new Error(`ListPlayers runtime is not active.`) }, () => issue)
  for (const channel of channels) {
    const result = await invoke(channel)
    assert.equal(result.ok, false)
    assert.equal(result.error?.code, `CONSOLE_SETUP_REQUIRED`)
    assert.equal(result.error?.message, issue)
  }
  assert.equal(calls, 0)
})

test(`unexpected player refresh failures return a public result and retain diagnostics`, async context => {
  const errors: unknown[][] = []
  context.mock.method(console, `warn`, (...values: unknown[]) => { errors.push(values) })
  const failure = new Error(`ListPlayers runtime is not active.`)
  const invoke = fixture(async () => { throw failure })
  for (const channel of channels) {
    const result = await invoke(channel)
    assert.equal(result.ok, false)
    assert.equal(result.error?.code, `PLAYER_LIST_UNAVAILABLE`)
    assert.ok(result.error?.message)
    assert.notEqual(result.error?.message, failure.message)
  }
  assert.ok(errors.some(values => values.includes(failure)))
})

test(`a readiness change during refresh returns its latest recovery reason`, async context => {
  context.mock.method(console, `warn`, () => {})
  let issue: string | null = null
  const recovery = `New recovery guidance`
  const invoke = fixture(async () => { issue = recovery; throw new Error(`Stopped during refresh`) }, () => issue)
  const result = await invoke(channels[0])
  assert.equal(result.error?.code, `CONSOLE_SETUP_REQUIRED`)
  assert.equal(result.error?.message, recovery)
})

test(`ready player refreshes preserve the poller result on both channels`, async () => {
  const invoke = fixture(async () => success)
  for (const channel of channels) assert.equal(await invoke(channel), success)
})

test(`restoration failures returned during refresh use public guidance before setup polling observes them`, async context => {
  context.mock.method(console, `warn`, () => {})
  const error = { code: `KEYBOARD_LAYOUT_RESTORE_FAILED`, message: `Native restoration details` }
  for (const result of [
    { ok: false, status: 409, statusText: `Conflict`, data: null, error },
    { ok: true, status: 200, statusText: `OK`, data: { ok: false, error } }
  ]) {
    const invoke = fixture(async () => result)
    const failure = await invoke(channels[0])
    assert.equal(failure.ok, false)
    assert.equal(failure.error?.code, `CONSOLE_SETUP_REQUIRED`)
    assert.notEqual(failure.error?.message, error.message)
    assert.ok(failure.error?.message)
    assert.equal(failure.data, null)
  }
})

test(`unrelated refresh result failures keep their existing error contract`, async () => {
  const denied: CoreCallResult = { ok: false, status: 403, statusText: `Forbidden`, data: null,
    error: { code: `ACCESS_DENIED`, message: `Caller-provided denial` } }
  const invoke = fixture(async () => denied)
  assert.equal(await invoke(channels[0]), denied)
})
