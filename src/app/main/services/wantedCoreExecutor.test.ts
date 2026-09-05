import assert from 'node:assert/strict'
import test from 'node:test'
import type { HttpClient } from '../api/http-client'
import type { RequestIdFactory } from '../request-id-factory'
import type { CoreCallResult } from '../types'
import type { OverlayActivityGuard } from './overlay-activity-guard'
import { WantedCoreExecutor } from './wantedCoreExecutor'
import type { ResolvedWantedMessages } from './wantedMessageResolver'
import type { WantedWork } from './wantedWorkClient'

const ok: CoreCallResult = {
  ok: true,
  status: 200,
  statusText: `OK`,
  data: { ok: true, data: { sent: true, sentCommands: 2 } }
}

test(`interactive ban holds the batch guard around exact ban then Serversay payload`, async () => {
  const pending = deferred<CoreCallResult>()
  const events: string[] = []
  const calls: unknown[] = []
  const executor = createExecutor({
    postCoreInput: async (path, payload) => {
      events.push(`core:start`)
      calls.push([path, payload])
      const result = await pending.promise
      events.push(`core:end`)
      return result
    }
  }, {
    beginGameCommandBatch: () => {
      events.push(`guard:begin`)
      return null
    },
    endGameCommandBatch: () => events.push(`guard:end`)
  })

  const executing = executor.execute(work(), messages(), `interactive`)
  assert.deepEqual(events, [`guard:begin`, `core:start`])
  assert.deepEqual(calls, [[`/v2/console/batch`, {
    id: `wanted-ban-id`,
    commands: [
      {
        commandType: `ban`,
        playfabId: `PLAYER_1`,
        hours: 999999,
        message: `[SB Autoban] Cheating`,
        delayMs: 0
      },
      { commandType: `server_message`, message: `[SB Wanted] Player banned`, delayMs: 0 }
    ]
  }]])

  pending.resolve(ok)
  assert.deepEqual(await executing, { ok: true })
  assert.deepEqual(events, [`guard:begin`, `core:start`, `core:end`, `guard:end`])
})

test(`unban sends one typed command with explicit null fields`, async () => {
  const calls: unknown[] = []
  const executor = createExecutor({
    postCoreInput: async (path, payload) => {
      calls.push([path, payload])
      return ok
    }
  })

  assert.deepEqual(await executor.execute(work({ actionType: `unban`, offenseType: null }), {
    automaticReason: `[SB Wanted] Player unbanned`
  }, `interactive`), { ok: true })
  assert.deepEqual(calls, [[`/v2/console/batch`, {
    id: `wanted-unban-id`,
    commands: [{
      commandType: `unban`,
      playfabId: `PLAYER_1`,
      hours: null,
      message: null,
      delayMs: 0
    }]
  }]])
})

test(`second ban attempt is silent and only confirmed sent responses succeed`, async () => {
  const calls: unknown[] = []
  const executor = createExecutor({
    postCoreInput: async (path, payload) => {
      calls.push([path, payload])
      return ok
    }
  })

  assert.deepEqual(await executor.execute(work({ attemptNumber: 2, announce: false }), messages(), `interactive`), {
    ok: true
  })
  assert.deepEqual(calls, [[`/v2/console/batch`, {
    id: `wanted-ban-id`,
    commands: [{
      commandType: `ban`,
      playfabId: `PLAYER_1`,
      hours: 999999,
      message: `[SB Autoban] Cheating`,
      delayMs: 0
    }]
  }]])

  const ambiguous = createExecutor({ postCoreInput: async () => ({
    ok: true,
    status: 200,
    statusText: `OK`,
    data: { ok: true, data: { sentCommands: 1 } }
  }) })
  assert.equal((await ambiguous.execute(work(), messages(), `interactive`)).ok, false)
})

test(`mock uses only the interactive admin message path`, async () => {
  const events: string[] = []
  const calls: unknown[] = []
  const executor = createExecutor({
    postCoreInput: async (path, payload) => {
      calls.push([path, payload])
      return ok
    }
  }, {
    getInactiveGameCommandResult: () => {
      events.push(`guard:check`)
      return null
    },
    beginGameCommandBatch: () => {
      events.push(`unexpected batch`)
      return null
    }
  })

  assert.deepEqual(await executor.execute(work({ actionType: `mock` }), {
    automaticReason: `[SB] Mocked`,
    mockAdminsay: `[SB] Mocked`
  }, `interactive`), { ok: true })
  assert.deepEqual(events, [`guard:check`])
  assert.deepEqual(calls, [[`/v2/console/message`, {
    id: `wanted-mock-id`,
    kind: `admin`,
    message: `[SB] Mocked`
  }]])
})

test(`hidden idle execution asks Core to recheck activity and never touches the overlay guard`, async () => {
  const calls: unknown[] = []
  const executor = createExecutor({
    callCore: async (path, init) => {
      calls.push([path, init])
      return ok
    },
    postCoreInput: async () => { throw new Error(`restore-target path used`) }
  }, {
    beginGameCommandBatch: () => { throw new Error(`guard used`) },
    getInactiveGameCommandResult: () => { throw new Error(`guard used`) }
  })

  assert.deepEqual(await executor.execute(work(), messages(), `background`), { ok: true })
  assert.deepEqual(calls, [[`/v2/console/batch`, {
    method: `POST`,
    body: JSON.stringify({
      id: `wanted-ban-id`,
      background: true,
      requireIdle: true,
      commands: [
        {
          commandType: `ban`,
          playfabId: `PLAYER_1`,
          hours: 999999,
          message: `[SB Autoban] Cheating`,
          delayMs: 0
        },
        { commandType: `server_message`, message: `[SB Wanted] Player banned`, delayMs: 0 }
      ]
    })
  }]])
})

test(`guard and nested partial Core failures are known bounded failures`, async () => {
  const guardFailure: CoreCallResult = {
    ok: false,
    status: 409,
    statusText: `OVERLAY_INACTIVE`,
    data: null,
    error: { code: `OVERLAY_INACTIVE`, message: `Overlay inactive` }
  }
  const guarded = createExecutor({}, { beginGameCommandBatch: () => guardFailure })
  assert.deepEqual(await guarded.execute(work(), messages(), `interactive`), {
    ok: false,
    failure: { code: `OVERLAY_INACTIVE`, message: `Overlay inactive` }
  })

  const partial = createExecutor({ postCoreInput: async () => ({
    ok: true,
    status: 200,
    statusText: `OK`,
    data: {
      ok: false,
      error: { code: `INPUT_FAILED`, message: `Second command failed` },
      data: { sentCommands: 1, failedCommandIndex: 1 }
    }
  }) })
  assert.deepEqual(await partial.execute(work(), messages(), `interactive`), {
    ok: false,
    failure: { code: `INPUT_FAILED`, message: `Second command failed` }
  })
})

function createExecutor(
  httpOverrides: Partial<Pick<HttpClient, `callCore` | `postCoreInput`>>,
  guardOverrides: Partial<Pick<OverlayActivityGuard,
    `beginGameCommandBatch` | `endGameCommandBatch` | `getInactiveGameCommandResult`
  >> = {}
): WantedCoreExecutor {
  const http = {
    callCore: async () => ok,
    postCoreInput: async () => ok,
    ...httpOverrides
  } as Pick<HttpClient, `callCore` | `postCoreInput`>
  const guard = {
    beginGameCommandBatch: () => null,
    endGameCommandBatch: () => undefined,
    getInactiveGameCommandResult: () => null,
    ...guardOverrides
  } as Pick<OverlayActivityGuard,
    `beginGameCommandBatch` | `endGameCommandBatch` | `getInactiveGameCommandResult`
  >
  const requestIds = {
    next: (scope: string) => `${scope}-id`
  } as Pick<RequestIdFactory, `next`>
  return new WantedCoreExecutor(http, requestIds, guard)
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
