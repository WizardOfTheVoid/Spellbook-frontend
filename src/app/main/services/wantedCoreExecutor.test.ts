import assert from 'node:assert/strict'
import test from 'node:test'
import { ActionBuilder } from '../core/actionBuilder'
import type { HttpClient } from '../api/http-client'
import type { CoreCommand } from '../../shared/coreAction'
import type { ActionExecutionOptions } from '../core/actionClient'
import type { CoreCallResult } from '../types'
import { WantedCoreExecutor } from './wantedCoreExecutor'
import type { ResolvedWantedMessages } from './wantedMessageResolver'
import type { WantedWork } from './wantedWorkClient'

const ok: CoreCallResult = { ok: true, status: 200, statusText: `OK`, data: { ok: true, data: { status: `completed`, sent: true, sentCommands: 2 } } }

test(`Wanted forwards worker cancellation to the Action request`, async () => {
  const cancellation = new AbortController()
  const fixture = createExecutor()
  await fixture.executor.execute(work(), messages(), `background`, cancellation.signal)
  assert.equal(fixture.calls[0]?.options.signal, cancellation.signal)
})

test(`interactive Wanted ban holds the guard and sends normalized ban then announcement at high priority`, async () => {
  const pending = deferred<CoreCallResult>()
  const fixture = createExecutor(async () => pending.promise)
  const executing = fixture.executor.execute(work(), messages(), `interactive`)
  assert.deepEqual(fixture.events, [`begin`, `send`])
  assert.deepEqual(fixture.calls, [{
    commands: [
      { type: `console`, command: `BanById PLAYER_1 999999 "[SB Autoban] Cheating"`, consoleKey: `Backquote`, delayMs: 0 },
      { type: `console`, command: `Serversay "[SB Wanted] Player banned"`, consoleKey: `Backquote`, delayMs: 0 }
    ],
    options: { id: `wanted-ban-id`, author: `system`, priority: `high` }
  }])
  pending.resolve(ok)
  assert.deepEqual(await executing, { ok: true })
  assert.deepEqual(fixture.events, [`begin`, `send`, `end`])
})

for (const mode of [`background`, `sentinel`] as const) test(`${mode} Wanted bans use system priority independently of their ban content`, async () => {
  const fixture = createExecutor()
  assert.deepEqual(await fixture.executor.execute(work(), messages(), mode), { ok: true })
  assert.deepEqual(fixture.events, [`send`])
  assert.equal(fixture.calls[0]?.options.priority, `high`)
  assert.equal(fixture.calls[0]?.options.author, `system`)
})

test(`Wanted unbans retain four Commands and subsequent ban attempts omit the announcement`, async () => {
  const fixture = createExecutor()
  await fixture.executor.execute(work({ actionType: `unban`, offenseType: null }), messages(), `interactive`)
  assert.deepEqual(fixture.calls[0]?.commands.map(command => command.type === `console` && command.command), Array(4).fill(`UnbanById PLAYER_1`))
  await fixture.executor.execute(work({ attemptNumber: 2, announce: false }), messages(), `background`)
  assert.equal(fixture.calls[1]?.commands.length, 1)
})

test(`mock uses the single-message overlay guard and a Serversay Command`, async () => {
  const fixture = createExecutor()
  await fixture.executor.execute(work({ actionType: `mock` }), { automaticReason: `Mocked`, mockServersay: `[SB] Mocked` }, `interactive`)
  assert.deepEqual(fixture.events, [`check`, `send`])
  assert.deepEqual(fixture.calls[0]?.commands, [{ type: `console`, command: `Serversay "[SB] Mocked"`, consoleKey: `Backquote`, delayMs: 0 }])
})

test(`ambiguous, partially submitted and expired results remain failed Wanted outcomes`, async () => {
  for (const data of [{ sentCommands: 1 }, { sent: true, status: `expired`, sentCommands: 1 }]) {
    const fixture = createExecutor(async () => ({ ...ok, data: { ok: true, data } }))
    assert.equal((await fixture.executor.execute(work(), messages(), `interactive`)).ok, false)
    assert.equal(fixture.events.at(-1), `end`)
  }
  const fixture = createExecutor(async () => ({ ...ok, data: {
    ok: false, error: { code: `INPUT_FAILED`, message: `Second command failed` },
    data: { sentCommands: 1, failedCommandIndex: 1, status: `failed` }
  } }))
  assert.deepEqual(await fixture.executor.execute(work(), messages(), `interactive`), {
    ok: false, sentCommands: 1, failure: { code: `INPUT_FAILED`, message: `Second command failed` }
  })
})

for (const status of [`failed`, `expired`, `cancelled`] as const) test(`Wanted preserves a submitted ban when its announcement is ${status}`, async () => {
  const fixture = createExecutor(async () => ({
    ok: false, status: 409, statusText: `Conflict`, data: {
      ok: false, error: { code: `ACTION_${status.toUpperCase()}`, message: `Announcement ${status}.` },
      data: { status, sent: false, sentCommands: 1, failedCommandIndex: 1 }
    }
  }))

  assert.deepEqual(await fixture.executor.execute(work(), messages(), `background`), {
    ok: false,
    sentCommands: 1,
    failure: { code: `ACTION_${status.toUpperCase()}`, message: `Announcement ${status}.` }
  })
})

test(`Wanted never credits ambiguous or invalid progress as a submitted ban`, async () => {
  for (const data of [
    { sentCommands: 1 },
    ...[0, -1, 1.5, 3, `1`, null].map(sentCommands => ({ status: `failed`, sent: false, sentCommands }))
  ]) {
    const fixture = createExecutor(async () => ({ ...ok, ok: false, data: { ok: false, data } }))
    const result = await fixture.executor.execute(work(), messages(), `background`)
    assert.equal(result.ok, false)
    assert.equal(`sentCommands` in result, false)
  }
})

test(`inactive Wanted overlay input returns the guard failure without submitting`, async () => {
  const inactive = { ...ok, ok: false, status: 409, statusText: `OVERLAY_INACTIVE`, data: null,
    error: { code: `OVERLAY_INACTIVE`, message: `Overlay inactive` } }
  const fixture = createExecutor(async () => ok, inactive)
  assert.deepEqual(await fixture.executor.execute(work(), messages(), `interactive`), { ok: false, failure: inactive.error })
  assert.equal(fixture.calls.length, 0)
})

function createExecutor(result: () => Promise<CoreCallResult> = async () => ok, inactive: CoreCallResult | null = null) {
  const calls: Array<{ commands: CoreCommand[], options: ActionExecutionOptions }> = []
  const events: string[] = []
  const http: Pick<HttpClient, `commands` | `executeAction`> = {
    commands: new ActionBuilder(() => `Backquote`),
    executeAction: async (commands, options) => { calls.push({ commands, options }); events.push(`send`); return result() }
  }
  const executor = new WantedCoreExecutor(http, { next: scope => `${scope}-id` }, {
    beginGameCommandBatch: () => { events.push(`begin`); return inactive },
    endGameCommandBatch: () => { events.push(`end`) },
    getInactiveGameCommandResult: () => { events.push(`check`); return inactive }
  })
  return { executor, calls, events }
}

function work(overrides: Partial<WantedWork> = {}): WantedWork {
  return {
    wantedId: 7,
    sourceActionId: 41,
    targetServerId: 13,
    playfabId: `PLAYER_1`,
    actionType: `ban`,
    offenseType: `hacker`,
    duration: null,
    sourceReason: `Cheating`,
    creationType: `auto`,
    cycleRevision: 0,
    attemptNumber: 1,
    announce: true,
    ...overrides
  }
}

function messages(): ResolvedWantedMessages {
  return {
    automaticReason: `[SB Autoban] Cheating`,
    banAnnouncement: `[SB Wanted] Player banned`
  }
}

function deferred<T>(): { promise: Promise<T>, resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(accept => { resolve = accept })
  return { promise, resolve }
}
