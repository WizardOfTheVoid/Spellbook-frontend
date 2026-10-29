import assert from 'node:assert/strict'
import test from 'node:test'
import { createActionEventsApiSource } from './actionEventsApiSource'
import { createActionEventsQuery } from './actionEventsQuery'

test(`the live source loads authorized filters before data and forwards search and cursor unchanged`, async () => {
  const calls: { operation: string, input: unknown }[] = []
  const source = createActionEventsApiSource(async <T>(operation: string, input: unknown) => {
    calls.push({ operation, input })
    return (operation === `eventFilters` ? { teams: [{ id: 10, name: `Team`, isMine: true }], admins: [] }
      : operation === `cancelEvent` ? { id: 21, status: `cancelled` } : { items: [], nextCursor: null, total: 0 }) as T
  })
  const query = { ...createActionEventsQuery(), search: `100%_ magic` }
  const signal = new AbortController().signal
  await source.list({ query, limit: 30, signal })
  await source.list({ query, cursor: `opaque`, limit: 30, signal })
  assert.deepEqual(calls.map(call => call.operation), [`eventFilters`, `events`, `events`])
  assert.equal(source.catalog.teams[0].id, 10)
  assert.deepEqual(calls[2].input, { query: JSON.stringify(query), cursor: `opaque`, limit: 30 })
  assert.equal((await source.cancel({ id: 21, signal })).status, `cancelled`)
})

test(`failed filters never expose mock data and stale responses do not update the source`, async () => {
  const source = createActionEventsApiSource(async () => { throw new Error(`Unavailable`) })
  await assert.rejects(() => source.list({ query: createActionEventsQuery(), limit: 30, signal: new AbortController().signal }), /Unavailable/u)
  assert.deepEqual(source.catalog, { teams: [], admins: [], servers: [] })
  const controller = new AbortController()
  const stale = createActionEventsApiSource(async <T>() => {
    controller.abort()
    return { teams: [{ id: 99 }], admins: [] } as T
  })
  await assert.rejects(() => stale.list({ query: createActionEventsQuery(), limit: 30, signal: controller.signal }), { name: `AbortError` })
  assert.equal(stale.catalog.teams.length, 0)
})

test(`first-page refreshes reload visible filter choices and aborted catalogs preserve the previous catalog`, async () => {
  let revision = 0
  let abort: AbortController | undefined
  const source = createActionEventsApiSource(async <T>(operation: string) => {
    if (operation !== `eventFilters`) return { items: [], nextCursor: null } as T
    revision++
    abort?.abort()
    return { teams: [{ id: revision }], admins: [] } as T
  })
  const query = createActionEventsQuery()
  const signal = new AbortController().signal
  await source.list({ query, limit: 30, signal })
  await source.list({ query, limit: 30, signal })
  assert.equal(revision, 2)
  assert.equal(source.catalog.teams[0].id, 2)
  abort = new AbortController()
  await assert.rejects(() => source.list({ query, limit: 30, signal: abort!.signal }), { name: `AbortError` })
  assert.equal(source.catalog.teams[0].id, 2)
})

test(`refreshed permissions can discard a stale page before its event request is sent`, async () => {
  const controller = new AbortController()
  const calls: string[] = []
  const source = createActionEventsApiSource(async <T>(operation: string) => {
    calls.push(operation)
    return { teams: [], admins: [], servers: [] } as T
  }, catalog => {
    assert.deepEqual(catalog.teams, [])
    controller.abort()
  })
  await assert.rejects(() => source.list({ query: createActionEventsQuery(), limit: 30, signal: controller.signal }), { name: `AbortError` })
  assert.deepEqual(calls, [`eventFilters`])
})
