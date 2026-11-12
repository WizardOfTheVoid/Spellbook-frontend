import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TelemetryOrchestrator } from './telemetryOrchestrator'
import { setImmediate } from 'node:timers/promises'
import { initialGameState } from '../../shared/gameState'

test(`late status from an old account cannot acquire the next account's recording`, async () => {
  const delayed = deferred<unknown>()
  const stops: string[] = []
  const controller = {
    start: async () => ({
      call: async (path: string) => (path === `/status` ? delayed.promise : stops.push(path))
    }),
    stop: async () => {}
  }
  const model = new TelemetryOrchestrator(
    () => controller as never,
    { clear: () => {} } as never,
    async () => null
  )
  await model.setAccess({ allowed: true, userId: 1 })
  const pending = model.call(`getStatus`)
  await setImmediate()
  await model.setAccess({ allowed: true, userId: 2 })
  await model.call(`listRecordings`)
  delayed.resolve({ active: { id: `old-account-recording` } })
  await assert.rejects(pending)
  await model.dispose()
  assert.deepEqual(
    stops.filter((path) => path.endsWith(`/stop`)),
    []
  )
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

test(`joining the endpoint selected before capture does not stop acquisition`, async () => {
  const id = `34b61043-c474-48fa-97af-62408c7ed02e`
  const endpoint = { host: `5.101.165.14`, port: 10380 }
  let stopped = 0
  const client = {
    call: async (path: string) => {
      if (path.endsWith(`/stop`)) stopped++
      return { id, endpoint }
    }
  }
  const controller = { start: async () => client, stop: async () => {} }
  const model = new TelemetryOrchestrator(
    () => controller as never,
    { clear: () => {} } as never,
    async () => null
  )
  await model.setAccess({ allowed: true, userId: 31 })
  await model.call(`startRecording`, { endpoint })
  await model.sourceChanged(`5.101.165.14:10380`)
  assert.equal(stopped, 0)
  await model.sourceChanged(`5.101.165.14:10120`)
  assert.equal(stopped, 1)
  await model.dispose()
})

test(`menu capture survives matching rejoin and unavailable Core but stops on a proven different target`, async () => {
  const endpoint = { host: `192.0.2.1`, port: 7777 }
  const id = `34b61043-c474-48fa-97af-62408c7ed02e`
  const menu = { ...initialGameState, available: true, running: true, map: `Hastings`, playerCount: 1 }
  const joined = { ...menu, map: `Arena`, connected: true, playerCount: 8 }
  let stopped = 0
  let active: { id: string, endpoint: typeof endpoint } | null = null
  const client = { call: async (path: string) => {
    if (path === `/status`) return { active, capture: { available: true } }
    if (path.endsWith(`/stop`)) { stopped++; active = null }
    else if (path === `/recordings`) active = { id, endpoint }
    return { id, endpoint }
  } }
  const model = new TelemetryOrchestrator(() => ({ start: async () => client, stop: async () => {} }) as never, { clear: () => {} } as never, async () => null)
  await model.setAccess({ allowed: true, userId: 31 })
  await model.observeGameState(menu, null)
  await model.call(`startRecording`, { endpoint })
  await model.observeGameState(joined, `192.0.2.1:7777`)
  await model.observeGameState(menu, null)
  await model.observeGameState(initialGameState, null)
  await model.observeGameState(joined, `192.0.2.1:7777`)
  assert.equal(stopped, 0)
  await model.observeGameState(joined, `192.0.2.1:7778`)
  assert.equal(stopped, 1)
  const status = await model.call(`getStatus`) as { active: unknown, error: string }
  assert.equal(status.active, null)
  assert.match(status.error, /selected target/)
  await model.dispose()
})

test(`a target change during helper activation saves the new capture before reporting startup failure`, async () => {
  const endpoint = { host: `192.0.2.1`, port: 7777 }
  const id = `34b61043-c474-48fa-97af-62408c7ed02e`
  const activation = deferred<unknown>()
  let stopped = 0
  const client = { call: async (path: string) => {
    if (path === `/recordings`) return activation.promise
    if (path.endsWith(`/stop`)) stopped++
    return { id, endpoint, state: `saved` }
  } }
  const model = new TelemetryOrchestrator(() => ({ start: async () => client, stop: async () => {} }) as never, { clear: () => {} } as never, async () => null)
  await model.setAccess({ allowed: true, userId: 31 })
  await model.observeGameState({ ...initialGameState, available: true, running: true }, null)
  const start = model.call(`startRecording`, { endpoint })
  await setImmediate()
  await model.observeGameState({ ...initialGameState, available: true, running: true, connected: true }, `192.0.2.2:7777`)
  activation.resolve({ id, endpoint, state: `recording` })
  await assert.rejects(start, /selected target/)
  assert.equal(stopped, 1)
  await model.dispose()
})

test(`a confirmed exit stops once while an already joined different endpoint cannot start a target`, async () => {
  const endpoint = { host: `192.0.2.1`, port: 7777 }
  const id = `34b61043-c474-48fa-97af-62408c7ed02e`
  let starts = 0
  let stops = 0
  const client = { call: async (path: string) => {
    if (path === `/recordings`) starts++
    if (path.endsWith(`/stop`)) stops++
    return { id, endpoint }
  } }
  const model = new TelemetryOrchestrator(() => ({ start: async () => client, stop: async () => {} }) as never, { clear: () => {} } as never, async () => null)
  await model.setAccess({ allowed: true, userId: 31 })
  await model.observeGameState({ ...initialGameState, available: true, running: true, connected: true }, `192.0.2.2:7777`)
  await assert.rejects(model.call(`startRecording`, { endpoint }), /selected server/)
  assert.equal(starts, 0)
  await model.observeGameState({ ...initialGameState, available: true, running: true }, null)
  await model.call(`startRecording`, { endpoint })
  await Promise.all([
    model.observeGameState({ ...initialGameState, available: true }, null),
    model.observeGameState({ ...initialGameState, available: true }, null)
  ])
  assert.equal(stops, 1)
  await model.dispose()
})

test(`event grouping and ordering cross the main boundary only as booleans`, async () => {
  const requests: unknown[] = []
  const client = { call: async (_path: string, body: unknown) => {
    requests.push(body)
    return { events: [] }
  } }
  const controller = { start: async () => client, stop: async () => {} }
  const model = new TelemetryOrchestrator(
    () => controller as never,
    { clear: () => {} } as never,
    async () => null
  )
  await model.setAccess({ allowed: true, userId: 31 })
  const query = {
    recordingId: `34b61043-c474-48fa-97af-62408c7ed02e`,
    fromUs: 0, toUs: 1_000_000, groupItems: false, newestFirst: true
  }
  await model.call(`getEvents`, query)
  assert.equal((requests.at(-1) as typeof query).groupItems, false)
  assert.equal((requests.at(-1) as typeof query).newestFirst, true)
  await assert.rejects(model.call(`getEvents`, { ...query, groupItems: `false` }))
  await assert.rejects(model.call(`getEvents`, { ...query, newestFirst: 1 }))
  await model.dispose()
})

test(`rich reads forward bounded pinned queries and hiding cancels them without stopping capture`, async () => {
  const requests: { path: string; body: unknown; signal?: AbortSignal }[] = []
  const view = { generation: `34b61043-c474-48fa-97af-62408c7ed02e`, throughSequence: 42, atUs: 1000 }
  const client = { call: async (path: string, body: unknown, _method?: string, _timeout?: number, signal?: AbortSignal) => {
    requests.push({ path, body, signal })
    return { recordingId: view.generation, revision: 1, series: [], truncated: false, readView: view }
  } }
  const model = new TelemetryOrchestrator(
    () => ({ start: async () => client, stop: async () => {} }) as never,
    { clear: () => {} } as never,
    async () => null
  )
  await model.setAccess({ allowed: true, userId: 31 })
  await model.call(`getMetricHistory`, {
    recordingId: view.generation, workspaceId: `live`, requestId: 5,
    fromUs: 0, toUs: 1000, trackId: `anonymous-1`, metrics: [`health`], maxPoints: 240, readView: view
  })
  assert.deepEqual((requests[0].body as { readView: unknown }).readView, view)
  assert.equal(requests[0].signal?.aborted, false)
  await model.call(`cancelReads`, { workspaceId: `live`, throughRequestId: 5 })
  assert.equal(requests[0].signal?.aborted, true)
  assert.equal(requests.some(request => request.path.endsWith(`/stop`)), false)
  await assert.rejects(model.call(`getMetricHistory`, {
    recordingId: view.generation, fromUs: 0, toUs: 1000, trackId: `anonymous-1`,
    metrics: [`arbitrary`], maxPoints: 240, readView: view
  }))
  await model.dispose()
})

test(`cancelling unused viewing reads does not start the worker`, async () => {
  let starts = 0
  const model = new TelemetryOrchestrator(
    () => ({ start: async () => { starts++; return {} }, stop: async () => {} }) as never,
    { clear: () => {} } as never,
    async () => null
  )
  await model.setAccess({ allowed: true, userId: 31 })
  await model.call(`cancelReads`, { workspaceId: `live`, throughRequestId: 1 })
  assert.equal(starts, 0)
  await model.dispose()
})
