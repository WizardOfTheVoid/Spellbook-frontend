import assert from 'node:assert/strict'
import test from 'node:test'
import { setImmediate as flushTasks } from 'node:timers/promises'
import { CoreHttpClient } from './core-http-client'
import { CoreRequestPayloadFactory } from './core-request-payload-factory'
import { HttpClient } from './http-client'
import { ServerHttpClient } from './server-http-client'
import { consoleKeyHeader, type ConsoleKeyCode } from '../../shared/consoleKey'

test(`all console calls use the current local bind, including background calls and batches`, async () => {
  let consoleKey: ConsoleKeyCode | null = `Backquote`
  const seen: Array<[string, string | null]> = []
  await withFetchMock(async input => {
    assert.ok(input instanceof Request)
    seen.push([new URL(input.url).pathname, input.headers.get(consoleKeyHeader)])
    return jsonResponse({ ok: true })
  }, async () => {
    const client = new HttpClient({
      coreBaseUrl: `http://127.0.0.1:48225`, coreAuthToken: `test`,
      serverBaseUrl: `http://127.0.0.1:48226`, serverAuthToken: ``,
      getConsoleKey: () => consoleKey
    }, new CoreRequestPayloadFactory(() => ({ getNativeWindowHandle: () => Buffer.from([1, 0, 0, 0]) })))
    await client.postCoreInput(`/v2/console/command`, { command: `ListPlayers` })
    consoleKey = `F6`
    for (const route of [`listplayers`, `message`, `batch`]) {
      await client.callCore(`/v2/console/${route}`, { method: `POST`, body: JSON.stringify({ background: true }) })
    }
    await client.callCore(`/v2/input/key`, { method: `POST`, body: `{}` })
    consoleKey = null
    await client.postCoreInput(`/v2/console/kick`, { playfabId: `abcd` })
  })
  assert.deepEqual(seen, [
    [`/v2/console/command`, `Backquote`], [`/v2/console/listplayers`, `F6`],
    [`/v2/console/message`, `F6`], [`/v2/console/batch`, `F6`],
    [`/v2/input/key`, null], [`/v2/console/kick`, null]
  ])
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
    const result = await new CoreHttpClient('http://127.0.0.1:48225', 'core-token').call('/v2/console/command', {
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
    assert.equal(input.url, `http://127.0.0.1:49200/v2/console/command`)
    assert.equal(input.headers.get(`X-Chiv-Admin-Token`), `replacement-token`)
    return jsonResponse({ ok: true })
  }, async () => {
    const client = new CoreHttpClient(`http://127.0.0.1:48125`, `old-token`)
    client.setConnection(`http://127.0.0.1:49200`, `replacement-token`)

    await client.call(`/v2/console/command`, { method: `POST`, body: `{}` })
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

test(`confirmed console sends report only counts through either facade path`, async () => {
  const reports: Record<string, unknown>[] = []
  const replies = [
    { ok: true, id: `same-id`, command: `Adminsay "private"`, data: { sent: true } },
    { ok: true, id: `same-id`, command: `sErVeRsAy "private"`, data: { sent: true } }
  ]
  await withFetchMock(async input => {
    assert.ok(input instanceof Request)
    if (input.url.endsWith(`/statistics/messages`)) {
      assert.equal(input.headers.get(`Authorization`), `Bearer actor-token`)
      reports.push(await input.json() as Record<string, unknown>)
      return jsonResponse({ ok: true })
    }
    return jsonResponse(replies.shift())
  }, async () => {
    const client = messageTrackingClient()
    await client.postCoreInput(`/v2/console/message`, { kind: `admin`, message: `private` })
    await client.callCore(`/v2/console/command`, { method: `POST`, body: JSON.stringify({ command: `sErVeRsAy "private"` }) })
    await flushTasks()
  })
  assert.equal(reports.length, 2)
  assert.deepEqual(reports.map(({ requestId, ...counts }) => counts), [
    { adminsay: 1, serversay: 0 }, { adminsay: 0, serversay: 1 }
  ])
  assert.ok(reports.every(report => typeof report.requestId === `string` && report.requestId.length <= 128))
  assert.notEqual(reports[0]!.requestId, reports[1]!.requestId)
})

function messageTrackingClient(token = `actor-token`): HttpClient {
  return new HttpClient({
    coreBaseUrl: `http://127.0.0.1:48225`, coreAuthToken: `core-token`,
    serverBaseUrl: `http://127.0.0.1:48226/api/v1`, serverAuthToken: token
  }, new CoreRequestPayloadFactory(() => ({ getNativeWindowHandle: () => Buffer.from([1, 0, 0, 0]) })))
}

test(`batch tracking maps the confirmed prefix after expanded unbans, including failures`, async () => {
  const reports: unknown[] = []
  let sentCommands = 5
  const commands = [
    { commandType: `unban` }, { commandType: `server_message` },
    { commandType: `warn` }, { commandType: `ban` }
  ]
  await withFetchMock(async input => {
    assert.ok(input instanceof Request)
    if (input.url.endsWith(`/statistics/messages`)) {
      const { requestId, ...counts } = await input.json()
      reports.push(counts)
      return jsonResponse({ ok: true })
    }
    return new Response(JSON.stringify({
      ok: sentCommands === 7,
      requestId: `batch-id`,
      data: { sentCommands, ...(sentCommands === 7 ? { sent: true } : {}), failedCommandIndex: sentCommands }
    }), { status: sentCommands === 7 ? 200 : 409 })
  }, async () => {
    const client = messageTrackingClient()
    const failed = await client.postCoreInput(`/v2/console/batch`, { commands })
    assert.equal(failed.ok, false)
    sentCommands = 7
    await client.callCore(`/v2/console/batch`, { method: `POST`, body: JSON.stringify({ commands }) })
    await flushTasks()
  })
  assert.deepEqual(reports, [{ adminsay: 0, serversay: 1 }, { adminsay: 0, serversay: 2 }])
})

test(`statistics skip unconfirmed, unrelated, malformed and unauthenticated sends`, async () => {
  let reportCount = 0
  let reply: unknown
  let status = 200
  await withFetchMock(async input => {
    assert.ok(input instanceof Request)
    if (input.url.endsWith(`/statistics/messages`)) reportCount++
    return new Response(JSON.stringify(reply), { status })
  }, async () => {
    const client = messageTrackingClient()
    for (const envelope of [
      { ok: true, command: `Adminsay "x"`, data: {} },
      { ok: false, command: `Adminsay "x"`, data: { sent: true } },
      { ok: true, command: `AdminsayOther "x"`, data: { sent: true } },
      { ok: true, command: `BanById xxxx "Adminsay"`, data: { sent: true } },
      null
    ]) {
      reply = envelope
      await client.postCoreInput(`/v2/console/command`, {})
    }
    reply = { ok: true, command: `Adminsay "x"`, data: { sent: true } }
    await client.callCore(`/v2/health`)
    await messageTrackingClient(``).postCoreInput(`/v2/console/message`, {})
    status = 500
    await client.postCoreInput(`/v2/console/message`, {})
    status = 409
    for (const sentCommands of [-1, 1.5, 3, `1`]) {
      reply = { ok: false, data: { sentCommands } }
      await client.postCoreInput(`/v2/console/batch`, { commands: [{ commandType: `warn` }] })
    }
    await flushTasks()
  })
  assert.equal(reportCount, 0)
})

test(`account changes and invalidation drop reports from in-flight Core sends`, async () => {
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
      const pending = client.postCoreInput(`/v2/console/warn`, { message: `private` })
      await started.promise
      if (change === `switch`) client.setServerAuthToken(`new-actor`)
      if (change === `logout`) client.setServerAuthToken(``)
      if (change === `intent`) client.advanceServerAuthEpoch()
      if (change === `unauthorized`) await client.getServer(`/players`)
      response.resolve(jsonResponse({ ok: true, command: `Serversay "private"`, data: { sent: true } }))
      await pending
      await flushTasks()
    })
    assert.equal(reportCount, 0, change)
  }
})

test(`statistics upload failure never retries or changes a confirmed Core result`, async () => {
  let coreCalls = 0
  let reportCalls = 0
  const reply = { ok: true, command: `Serversay "private"`, data: { sent: true } }
  await withFetchMock(async input => {
    assert.ok(input instanceof Request)
    if (input.url.endsWith(`/statistics/messages`)) {
      reportCalls++
      throw new Error(`statistics unavailable`)
    }
    coreCalls++
    return jsonResponse(reply)
  }, async () => {
    const result = await messageTrackingClient().postCoreInput(`/v2/console/warn`, {})
    assert.equal(result.ok, true)
    assert.deepEqual(result.data, reply)
    await flushTasks()
  })
  assert.equal(coreCalls, 1)
  assert.equal(reportCalls, 1)
})

test(`pending statistics uploads never hold up Core completion and are aborted`, async () => {
  const aborted = deferred<void>()
  const response = deferred<Response>()
  const signals: AbortSignal[] = []
  const originalTimeout = AbortSignal.timeout
  const controller = new AbortController()
  AbortSignal.timeout = () => controller.signal
  try {
    await withFetchMock(async input => {
      assert.ok(input instanceof Request)
      if (input.url.endsWith(`/statistics/messages`)) {
        signals.push(input.signal)
        input.signal.addEventListener(`abort`, () => {
          aborted.resolve()
          response.resolve(errorResponse(503, `Aborted`))
        }, { once: true })
        return response.promise
      }
      return jsonResponse({ ok: true, command: `Adminsay "private"`, data: { sent: true } })
    }, async () => {
      const result = await messageTrackingClient().postCoreInput(`/v2/console/message`, {})
      assert.equal(result.ok, true)
      assert.equal(signals.length, 1)
      controller.abort()
      await aborted.promise
      await flushTasks()
    })
  } finally {
    AbortSignal.timeout = originalTimeout
  }
})

test(`large batches upload bounded chunks without losing submitted messages`, async () => {
  const reports: Array<{ requestId: string, adminsay: number, serversay: number }> = []
  await withFetchMock(async input => {
    assert.ok(input instanceof Request)
    if (input.url.endsWith(`/statistics/messages`)) {
      reports.push(await input.json())
      return jsonResponse({ ok: true })
    }
    return jsonResponse({ ok: true, command: `batch`, data: { sent: true, sentCommands: 201 } })
  }, async () => {
    await messageTrackingClient().postCoreInput(`/v2/console/batch`, {
      commands: Array.from({ length: 201 }, () => ({ commandType: `server_message` }))
    })
    await flushTasks()
  })
  assert.deepEqual(reports.map(({ serversay }) => serversay), [100, 100, 1])
  assert.equal(new Set(reports.map(({ requestId }) => requestId)).size, 3)
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(next => { resolve = next })
  return { promise, resolve }
}
