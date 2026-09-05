import assert from 'node:assert/strict'
import test from 'node:test'
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

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(next => { resolve = next })
  return { promise, resolve }
}
