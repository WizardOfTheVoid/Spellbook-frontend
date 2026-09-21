import assert from 'node:assert/strict'
import test from 'node:test'
import { setImmediate as flushTasks } from 'node:timers/promises'
import { CoreHttpClient } from './core-http-client'
import { CoreRequestPayloadFactory } from './core-request-payload-factory'
import { HttpClient } from './http-client'
import { ServerHttpClient } from './server-http-client'
import type { ConsoleKeyCode } from '../../shared/consoleKey'
import { ActionHandler } from '../services/actions/actionHandler'

test(`Action requests carry captured Command keys and one current app target without console headers`, async () => {
  let consoleKey: ConsoleKeyCode | null = `Backquote`
  const seen: Record<string, unknown>[] = []
  await withFetchMock(async input => {
    assert.ok(input instanceof Request)
    assert.equal(new URL(input.url).pathname, `/v3/actions`)
    assert.equal(input.headers.has(`X-SpellBook-Console-Key`), false)
    seen.push(await input.json())
    return jsonResponse({ ok: true })
  }, async () => {
    const client = new HttpClient({
      coreBaseUrl: `http://127.0.0.1:48225`, coreAuthToken: `test`,
      serverBaseUrl: `http://127.0.0.1:48226`, serverAuthToken: ``,
      getConsoleKey: () => consoleKey,
      getOwnPlayfabId: () => `ADMIN_1`
    }, new CoreRequestPayloadFactory(() => ({ getNativeWindowHandle: () => Buffer.from([1, 0, 0, 0]) })))
    const commands = client.commands.raw(`ListPlayers`)
    consoleKey = `F6`
    commands.push(...client.commands.message(`server`, `Hello`))
    await client.executeAction(commands, { id: `first`, author: `user`, priority: `normal` })
    consoleKey = null
    await client.executeAction(client.commands.kick(`PLAYER_1`, `reason`), { author: `user`, priority: `normal` })
  })
  assert.deepEqual(seen[0]?.app, { processId: process.pid, windowHandle: `0x0000000000000001` })
  assert.deepEqual((seen[0]?.commands as Array<{ consoleKey: string }>).map(command => command.consoleKey), [`Backquote`, `F6`])
  assert.equal((seen[1]?.commands as Array<{ consoleKey: string }>)[0]?.consoleKey, `NumpadSubtract`)
})

test(`self moderation rejects complete user and background recipes before any request`, async () => {
  const requests: unknown[] = []
  await withFetchMock(async input => {
    requests.push(input)
    return jsonResponse({ ok: true })
  }, async () => {
    const client = new HttpClient({
      coreBaseUrl: `http://127.0.0.1:48225`, coreAuthToken: `test`,
      serverBaseUrl: `http://127.0.0.1:48226`, serverAuthToken: ``,
      getOwnPlayfabId: () => ` player_1 `
    }, new CoreRequestPayloadFactory(() => ({ getNativeWindowHandle: () => Buffer.from([1, 0, 0, 0]) })))
    for (const commandType of [`ban`, `kick`] as const) {
      for (const author of [`user`, `system`] as const) {
        await assert.rejects(new ActionHandler(client).execute({
          label: `Moderate`, actionDomain: `player`, isEnabled: true, blockOnMissingVariables: true, delayMs: 0,
          commands: [
            { commandType: `server_message`, message: `Announcement`, sortOrder: 0, delayMs: 0 },
            { commandType, message: `Reason`, durationHours: 1, sortOrder: 1, delayMs: 0 }
          ]
        }, { type: `player`, playfabId: `PLAYER_1` }, {
          admin: `Admin`, serverName: `Test`, player: { playfabId: `PLAYER_1`, name: `Player` }
        }, { author, priority: `high` }), RangeError)
      }
    }
    assert.deepEqual(requests, [])
  })
})

test(`raw and prebuilt actions cannot bypass self moderation checks`, async () => {
  const requests: unknown[] = []
  await withFetchMock(async input => {
    requests.push(input)
    return jsonResponse({ ok: true })
  }, async () => {
    const client = new HttpClient({
      coreBaseUrl: `http://127.0.0.1:48225`, coreAuthToken: `test`,
      serverBaseUrl: `http://127.0.0.1:48226`, serverAuthToken: ``,
      getOwnPlayfabId: () => `PLAYER_1`
    }, new CoreRequestPayloadFactory(() => ({ getNativeWindowHandle: () => Buffer.from([1, 0, 0, 0]) })))
    for (const command of [`BanById player_1 1 "Reason"`, `  kIcKbYiD\t"PLAYER_1" "Reason"`]) {
      await assert.rejects(client.executeAction(client.commands.raw(command), actionOptions), RangeError)
      await assert.rejects(client.callCore(`/v3/actions/?test=1`, {
        method: `post`, body: JSON.stringify({ commands: [
          { type: `console`, command: `Serversay "Announcement"`, consoleKey: `Backquote` },
          { type: `console`, command, consoleKey: `Backquote` }
        ] })
      }), RangeError)
    }
    assert.deepEqual(requests, [])
  })
})

test(`submission uses current identity and allows other players and nonpunitive self actions`, async () => {
  let ownId: string | null = `PLAYER_1`
  const requests: unknown[] = []
  await withFetchMock(async input => {
    requests.push(input)
    return jsonResponse({ ok: true })
  }, async () => {
    const client = new HttpClient({
      coreBaseUrl: `http://127.0.0.1:48225`, coreAuthToken: `test`,
      serverBaseUrl: `http://127.0.0.1:48226`, serverAuthToken: ``,
      getOwnPlayfabId: () => ownId
    }, new CoreRequestPayloadFactory(() => ({ getNativeWindowHandle: () => Buffer.from([1, 0, 0, 0]) })))
    const otherPlayer = client.commands.batch([
      { commandType: `kick`, playfabId: ` PLAYER_2 `, message: `Reason`, delayMs: 0 },
      { commandType: `ban`, playfabId: `PLAYER_2`, hours: 1, message: `Reason`, delayMs: 0 }
    ])
    assert.equal((await client.executeAction(otherPlayer, actionOptions)).ok, true)
    ownId = `player_2`
    await assert.rejects(client.executeAction(otherPlayer, actionOptions), RangeError)
    for (ownId of [null, `   `]) {
      await assert.rejects(client.executeAction(client.commands.kick(`PLAYER_3`, `Reason`), actionOptions), RangeError)
      await assert.rejects(client.executeAction(client.commands.ban(`PLAYER_3`, 1, `Reason`), actionOptions), RangeError)
    }
    ownId = `PLAYER_2`
    assert.equal((await client.executeAction(client.commands.batch([
      { commandType: `unban`, playfabId: `PLAYER_2`, message: `Cleared`, delayMs: 0 },
      { commandType: `warn`, message: `BanById PLAYER_2 is mentioned in a message`, delayMs: 0 },
      { commandType: `server_message`, message: `KickById PLAYER_2 is mentioned in a message`, delayMs: 0 }
    ]), actionOptions)).ok, true)
    ownId = null
    assert.equal((await client.executeAction(client.commands.raw(`ListPlayers`), actionOptions)).ok, true)
    assert.equal(requests.length, 3)
  })
})

test('Core client sends an openapi-fetch Request and preserves response parsing', async () => {
  await withFetchMock(async input => {
    assert.ok(input instanceof Request)
    assert.equal(input.method, 'POST')
    assert.equal(input.headers.get('Accept'), 'application/json')
    assert.equal(input.headers.get('Content-Type'), 'application/json')
    assert.equal(input.headers.get('X-Chiv-Admin-Token'), 'core-token')
    assert.deepEqual(await input.json(), { command: 'listplayers' })

    return jsonResponse({ ok: true, data: { accepted: true } })
  }, async () => {
    const result = await new CoreHttpClient('http://127.0.0.1:48225', 'core-token').call('/v3/actions', {
      method: 'POST',
      body: JSON.stringify({ command: 'listplayers' })
    })

    assert.equal(result.ok, true)
    assert.deepEqual(result.data, { ok: true, data: { accepted: true } })
  })
})

test(`Core client replaces its connection before use`, async () => {
  await withFetchMock(async input => {
    assert.ok(input instanceof Request)
    assert.equal(input.url, `http://127.0.0.1:49200/v3/actions`)
    assert.equal(input.headers.get(`X-Chiv-Admin-Token`), `replacement-token`)
    return jsonResponse({ ok: true })
  }, async () => {
    const client = new CoreHttpClient(`http://127.0.0.1:48125`, `old-token`)
    client.setConnection(`http://127.0.0.1:49200`, `replacement-token`)

    await client.call(`/v3/actions`, { method: `POST`, body: `{}` })
    assert.equal(client.baseUrl, `http://127.0.0.1:49200`)
  })
})

test(`ordinary Core health GET remains unauthenticated`, async () => {
  await withFetchMock(async input => {
    assert.ok(input instanceof Request)
    assert.equal(input.headers.has(`X-Chiv-Admin-Token`), false)
    return jsonResponse({ ok: true })
  }, async () => {
    await new CoreHttpClient(`http://127.0.0.1:48125`, `core-token`).call(`/v2/health`)
  })
})

test(`HttpClient delegates one pre-use Core connection replacement`, async () => {
  await withFetchMock(async input => {
    assert.ok(input instanceof Request)
    assert.equal(input.url, `http://127.0.0.1:49200/v2/health`)
    return jsonResponse({ ok: true })
  }, async () => {
    const client = new HttpClient({
      coreBaseUrl: `http://127.0.0.1:48125`,
      coreAuthToken: `old-token`,
      serverBaseUrl: `http://127.0.0.1:48126/api/v1`,
      serverAuthToken: ``
    }, new CoreRequestPayloadFactory(() => { throw new Error(`not used`) }))

    client.setCoreConnection({
      baseUrl: `http://127.0.0.1:49200`,
      authToken: `replacement-token`
    })
    await client.callCore(`/v2/health`)

    assert.equal(client.coreBaseUrl, `http://127.0.0.1:49200`)
    assert.throws(
      () => client.setCoreConnection({ baseUrl: `http://127.0.0.1:49300`, authToken: `other` }),
      /once before the first request/u
    )
  })
})

test('Server client serializes query parameters through openapi-fetch', async () => {
  await withFetchMock(async input => {
    assert.ok(input instanceof Request)
    assert.equal(input.method, 'GET')
    assert.equal(input.url, 'http://127.0.0.1:48226/api/v1/players?limit=25&search=duel')
    assert.equal(input.headers.get('Accept'), 'application/json')
    assert.equal(input.headers.get('Authorization'), 'Bearer server-token')

    return jsonResponse({ ok: true, data: [] })
  }, async () => {
    const result = await new ServerHttpClient('http://127.0.0.1:48226/api/v1', 'server-token').get('/players', {
      limit: 25,
      search: 'duel',
      offset: undefined
    })

    assert.equal(result.ok, true)
    assert.deepEqual(result.data, { ok: true, data: [] })
  })
})

test(`Server client serializes variable replacements with PUT`, async () => {
  await withFetchMock(async input => {
    assert.ok(input instanceof Request)
    assert.equal(input.method, `PUT`)
    assert.equal(input.url, `http://127.0.0.1:48226/api/v1/gameserver/7/params`)
    assert.deepEqual(await input.json(), {
      params: [{ label: `Rules URL`, value: `https://example.test/rules`, sortOrder: 3 }]
    })
    return jsonResponse({ ok: true, data: [] })
  }, async () => {
    await new ServerHttpClient(`http://127.0.0.1:48226/api/v1`, `server-token`).put(
      `/gameserver/7/params`,
      { params: [{ label: `Rules URL`, value: `https://example.test/rules`, sortOrder: 3 }] }
    )
  })
})

test('HTTP clients preserve their unavailable result codes', async () => {
  await withFetchMock(async () => {
    throw new Error('offline')
  }, async () => {
    const core = await new CoreHttpClient('http://127.0.0.1:48225', 'core-token').call('/v2/health')
    const server = await new ServerHttpClient('http://127.0.0.1:48226/api/v1', 'server-token').get('/health')

    assert.equal(core.statusText, 'CORE_UNAVAILABLE')
    assert.equal(core.error?.message, 'offline')
    assert.equal(server.statusText, 'SERVER_UNAVAILABLE')
    assert.equal(server.error?.message, 'offline')
  })
})

test('Server client signals only non-auth 401 responses without awaiting invalidation', async () => {
  const observed: number[] = []

  await withFetchMock(async () => errorResponse(401, `Unauthorized`), async () => {
    const client = new ServerHttpClient(`http://127.0.0.1:48226/api/v1`, `server-token`)
    client.setUnauthorizedHandler(result => { observed.push(result.status) })
    await client.post(`/listplayers`, {})
    await client.get(`/auth/session`)
  })
  await withFetchMock(async () => errorResponse(403, `Forbidden`), async () => {
    const client = new ServerHttpClient(`http://127.0.0.1:48226/api/v1`, `server-token`)
    client.setUnauthorizedHandler(result => { observed.push(result.status) })
    await client.get(`/players`)
  })

  assert.deepEqual(observed, [401])
})

test('Server client contains asynchronous unauthorized observer failures', async () => {
  const errors: unknown[] = []

  await withFetchMock(async () => errorResponse(401, `Unauthorized`), async () => {
    const client = new ServerHttpClient(
      `http://127.0.0.1:48226/api/v1`,
      `server-token`,
      error => errors.push(error)
    )
    client.setUnauthorizedHandler(async () => { throw new Error(`session clear failed`) })
    await client.get(`/players`)
  })
  await new Promise(resolve => setImmediate(resolve))

  assert.equal((errors[0] as Error).message, `session clear failed`)
})

test('Server client ignores a delayed 401 from the token captured by an older request', async () => {
  const response = deferred<Response>()
  const requestStarted = deferred<void>()
  const observed: number[] = []

  await withFetchMock(async input => {
    assert.equal(new Headers((input as Request).headers).get(`Authorization`), `Bearer old-token`)
    requestStarted.resolve()
    return response.promise
  }, async () => {
    const client = new ServerHttpClient(`http://127.0.0.1:48226/api/v1`, `old-token`)
    client.setUnauthorizedHandler(result => { observed.push(result.status) })

    const oldRequest = client.get(`/players`)
    await requestStarted.promise
    client.setAuthToken(`new-token`)
    response.resolve(errorResponse(401, `Unauthorized`))
    await oldRequest
  })
  await new Promise(resolve => setImmediate(resolve))

  assert.deepEqual(observed, [])
})

test('Server client ignores a delayed 401 after an identity intent starts with the same token', async () => {
  const response = deferred<Response>()
  const requestStarted = deferred<void>()
  const observed: number[] = []

  await withFetchMock(async () => {
    requestStarted.resolve()
    return response.promise
  }, async () => {
    const client = new ServerHttpClient(`http://127.0.0.1:48226/api/v1`, `old-token`)
    client.setUnauthorizedHandler(result => { observed.push(result.status) })

    const oldRequest = client.get(`/players`)
    await requestStarted.promise
    client.advanceAuthEpoch()
    response.resolve(errorResponse(401, `Unauthorized`))
    await oldRequest
  })
  await new Promise(resolve => setImmediate(resolve))

  assert.deepEqual(observed, [])
})

test('Server client accepts only one of two concurrent 401 responses from the same auth epoch', async () => {
  const responses = [deferred<Response>(), deferred<Response>()]
  const bothStarted = deferred<void>()
  let requestCount = 0
  let invalidations = 0

  await withFetchMock(async () => {
    const index = requestCount++
    if (requestCount === 2) bothStarted.resolve()
    return responses[index]!.promise
  }, async () => {
    const client = new ServerHttpClient(`http://127.0.0.1:48226/api/v1`, `same-token`)
    client.setUnauthorizedHandler(() => { invalidations += 1 })

    const first = client.get(`/players`)
    const second = client.get(`/teams`)
    await bothStarted.promise
    responses[0]!.resolve(errorResponse(401, `Unauthorized`))
    responses[1]!.resolve(errorResponse(401, `Unauthorized`))
    await Promise.all([first, second])
  })
  await new Promise(resolve => setImmediate(resolve))

  assert.equal(invalidations, 1)
})

test('Server client returns a 401 response while its invalidation handler is still pending', async () => {
  const invalidation = deferred<void>()

  await withFetchMock(async () => errorResponse(401, `Unauthorized`), async () => {
    const client = new ServerHttpClient(`http://127.0.0.1:48226/api/v1`, `server-token`)
    client.setUnauthorizedHandler(() => invalidation.promise)

    const outcome = await Promise.race([
      client.get(`/players`).then(() => `response`),
      new Promise<string>(resolve => setImmediate(() => resolve(`blocked`)))
    ])
    assert.equal(outcome, `response`)
    invalidation.resolve()
  })
})

async function withFetchMock(mock: (input: RequestInfo | URL) => Promise<Response>, run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch
  globalThis.fetch = mock as typeof fetch

  try {
    await run()
  } finally {
    globalThis.fetch = originalFetch
  }
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    statusText: 'OK',
    headers: { 'Content-Type': 'application/json' }
  })
}

function errorResponse(status: number, statusText: string): Response {
  return new Response(JSON.stringify({ ok: false, error: { code: statusText, message: statusText } }), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' }
  })
}

function messageTrackingClient(token = `actor-token`): HttpClient {
  return new HttpClient({
    coreBaseUrl: `http://127.0.0.1:48225`, coreAuthToken: `core-token`,
    serverBaseUrl: `http://127.0.0.1:48226/api/v1`, serverAuthToken: token
  }, new CoreRequestPayloadFactory(() => ({ getNativeWindowHandle: () => Buffer.from([1, 0, 0, 0]) })))
}

const actionOptions = { author: `user`, priority: `normal` } as const

test(`Action cancellation reaches the HTTP request without entering the wire payload`, async () => {
  const response = deferred<Response>()
  const started = deferred<Request>()
  const cancellation = new AbortController()
  await withFetchMock(async input => {
    assert.ok(input instanceof Request)
    assert.equal(Object.hasOwn(await input.clone().json(), `signal`), false)
    started.resolve(input)
    await response.promise
    throw new DOMException(`Action aborted`, `AbortError`)
  }, async () => {
    const client = messageTrackingClient()
    const sending = client.executeAction(client.commands.raw(`ListPlayers`), { ...actionOptions, signal: cancellation.signal })
    const request = await started.promise
    cancellation.abort()
    response.resolve(errorResponse(499, `Cancelled`))
    assert.equal(request.signal.aborted, true)
    assert.equal((await sending).error?.code, `ACTION_CANCELLED`)
  })
})

test(`concurrent cancellation preserves received Core partial submission details`, async () => {
  const cancellation = new AbortController()
  const envelope = { ok: false, data: { status: `failed`, sentCommands: 1, failedCommandIndex: 1 }, error: { code: `INPUT_FAILED` } }
  await withFetchMock(async () => {
    cancellation.abort()
    return new Response(JSON.stringify(envelope), { status: 409 })
  }, async () => {
    const client = messageTrackingClient()
    const result = await client.executeAction(client.commands.raw(`ListPlayers`), { ...actionOptions, signal: cancellation.signal })
    assert.deepEqual(result.data, envelope)
  })
})

test(`message statistics count only the submitted Action prefix, including partial failures after four unbans`, async () => {
  const reports: unknown[] = []
  let sentCommands = 5
  await withFetchMock(async input => {
    assert.ok(input instanceof Request)
    if (input.url.endsWith(`/statistics/messages`)) {
      const { requestId, ...counts } = await input.json()
      assert.equal(typeof requestId, `string`)
      reports.push(counts)
      return jsonResponse({ ok: true })
    }
    return new Response(JSON.stringify({ ok: false, data: { sentCommands, status: `failed` } }), { status: 409 })
  }, async () => {
    const client = messageTrackingClient()
    const commands = [...client.commands.unban(`PLAYER_1`), ...client.commands.message(`admin`, `private`), ...client.commands.message(`server`, `private`)]
    await client.executeAction(commands, actionOptions)
    sentCommands = 6
    await client.executeAction(commands, actionOptions)
    await flushTasks()
  })
  assert.deepEqual(reports, [{ adminsay: 1, serversay: 0 }, { adminsay: 1, serversay: 1 }])
})

test(`statistics skip invalid progress and unauthenticated Actions`, async () => {
  let reportCount = 0
  let sentCommands: unknown = undefined
  await withFetchMock(async input => {
    assert.ok(input instanceof Request)
    if (input.url.endsWith(`/statistics/messages`)) reportCount++
    return jsonResponse({ ok: true, data: { sentCommands } })
  }, async () => {
    const client = messageTrackingClient()
    for (const count of [undefined, 0, -1, 2, 0.5]) {
      sentCommands = count
      await client.executeAction(client.commands.message(`admin`, `private`), actionOptions)
    }
    sentCommands = 1
    const anonymous = messageTrackingClient(``)
    await anonymous.executeAction(anonymous.commands.message(`admin`, `private`), actionOptions)
    await client.executeAction(client.commands.raw(`AdminsayOther test`), actionOptions)
    await flushTasks()
  })
  assert.equal(reportCount, 0)
})

test(`account changes and invalidation drop reports from in-flight Actions`, async () => {
  for (const change of [`switch`, `logout`, `intent`, `unauthorized`]) {
    const response = deferred<Response>()
    const started = deferred<void>()
    let reportCount = 0
    await withFetchMock(async input => {
      assert.ok(input instanceof Request)
      if (input.url.endsWith(`/statistics/messages`)) reportCount++
      if (input.url.endsWith(`/players`)) return errorResponse(401, `Unauthorized`)
      started.resolve()
      return response.promise
    }, async () => {
      const client = messageTrackingClient()
      const pending = client.executeAction(client.commands.message(`server`, `private`), actionOptions)
      await started.promise
      if (change === `switch`) client.setServerAuthToken(`new-actor`)
      if (change === `logout`) client.setServerAuthToken(``)
      if (change === `intent`) client.advanceServerAuthEpoch()
      if (change === `unauthorized`) await client.getServer(`/players`)
      response.resolve(jsonResponse({ ok: true, data: { sent: true, sentCommands: 1 } }))
      await pending
      await flushTasks()
    })
    assert.equal(reportCount, 0, change)
  }
})

test(`statistics failure does not repeat game input and large Actions upload bounded message counts`, async () => {
  for (const fail of [false, true]) {
    const reports: number[] = []
    let coreCalls = 0
    await withFetchMock(async input => {
      assert.ok(input instanceof Request)
      if (input.url.endsWith(`/statistics/messages`)) {
        reports.push((await input.json()).serversay)
        if (fail) throw new Error(`unavailable`)
        return jsonResponse({ ok: true })
      }
      coreCalls++
      return jsonResponse({ ok: true, data: { sent: true, sentCommands: 201 } })
    }, async () => {
      const client = messageTrackingClient()
      const commands = Array.from({ length: 201 }, () => client.commands.message(`server`, `private`)[0]!)
      assert.equal((await client.executeAction(commands, actionOptions)).ok, true)
      await flushTasks()
    })
    assert.equal(coreCalls, 1)
    assert.deepEqual(reports, fail ? [100] : [100, 100, 1])
  }
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(next => { resolve = next })
  return { promise, resolve }
}


test(`the command gate stops actions from services and raw callers before transport, preserving configuration access`, async () => {
  let allowed = false
  const paths: string[] = []
  await withFetchMock(async input => {
    assert.ok(input instanceof Request)
    paths.push(new URL(input.url).pathname)
    return jsonResponse({ ok: true })
  }, async () => {
    const client = new HttpClient({ coreBaseUrl: `http://127.0.0.1:48225`, coreAuthToken: `test`,
      serverBaseUrl: `http://127.0.0.1:48226`, serverAuthToken: ``, allowAction: () => allowed
    }, new CoreRequestPayloadFactory(() => ({ getNativeWindowHandle: () => Buffer.from([1, 0, 0, 0]) })))
    const result = await client.executeAction(client.commands.raw(`ListPlayers`), { author: `system`, priority: `high` })
    assert.equal(result.error?.code, `CONSOLE_SETUP_REQUIRED`)
    const raw = await client.callCore(`/v3/actions/?test=1`, { method: `post`, body: `{}` })
    assert.equal(raw.error?.code, `CONSOLE_SETUP_REQUIRED`)
    assert.deepEqual(paths, [])
    assert.equal((await client.callCore(`/chivalry2/gameusersettings/`, { method: `PATCH` })).ok, true)
    allowed = true
    assert.equal((await client.executeAction(client.commands.raw(`ListPlayers`), { author: `user`, priority: `normal` })).ok, true)
    assert.deepEqual(paths, [`/chivalry2/gameusersettings/`, `/v3/actions`])
  })
})

test(`blocking input cancels pending action requests without cancelling metadata`, async () => {
  const started = deferred<void>()
  const release = deferred<void>()
  const signals = new Map<string, AbortSignal>()
  await withFetchMock(async input => {
    assert.ok(input instanceof Request)
    signals.set(new URL(input.url).pathname, input.signal)
    if (signals.size === 2) started.resolve()
    await release.promise
    return jsonResponse({ ok: true })
  }, async () => {
    const client = new HttpClient({ coreBaseUrl: `http://127.0.0.1:48225`, coreAuthToken: `test`,
      serverBaseUrl: `http://127.0.0.1:48226`, serverAuthToken: ``
    }, new CoreRequestPayloadFactory(() => { throw new Error(`No app target needed`) }))
    const action = client.callCore(`/v3/actions`, { method: `POST`, body: `{}` })
    const meta = client.callCore(`/v2/meta/get`)
    await started.promise
    client.cancelGameActions()
    assert.equal(signals.get(`/v3/actions`)?.aborted, true)
    assert.equal(signals.get(`/v2/meta/get`)?.aborted, false)
    release.resolve()
    await Promise.all([action, meta])
  })
})
