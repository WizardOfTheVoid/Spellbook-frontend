import assert from 'node:assert/strict'
import test from 'node:test'
import { createActionEventsMock } from './actionEventsFixtures'
import { createActionEventsQuery } from './actionEventsQuery'

const now = Date.parse(`2026-10-23T12:00:00Z`)
const signal = () => new AbortController().signal

test(`search filters the complete 10,000-event corpus before pagination`, async () => {
  const source = createActionEventsMock({ count: 10_000, now: () => now, simulate: false })
  const query = { ...createActionEventsQuery(), search: `sample-00001`, timeRange: `all` as const, since: null }
  const result = await source.list({ query, limit: 30, signal: signal() })
  assert.deepEqual(result.items.map(item => item.id), [1])
  assert.equal(result.nextCursor, null)
})

test(`cursor pagination retains deterministic identity and has no overlap or lost rows`, async () => {
  const source = createActionEventsMock({ count: 205, now: () => now, simulate: false })
  const query = createActionEventsQuery()
  const first = await source.list({ query, limit: 30, signal: signal() })
  const second = await source.list({ query, cursor: first.nextCursor!, limit: 100, signal: signal() })
  const third = await source.list({ query, cursor: second.nextCursor!, limit: 100, signal: signal() })
  const ids = [...first.items, ...second.items, ...third.items].map(item => item.id)
  assert.equal(ids.length, 137)
  assert.equal(new Set(ids).size, 137)
  assert.equal(ids[0], 205)
  assert.equal(ids.at(-1), 1)
  assert.equal(third.nextCursor, null)
  const system = await source.list({ query: createActionEventsQuery({ systemOnly: true }), limit: 100, signal: signal() })
  assert.equal(system.items.length, 68)
  assert.equal(system.items.every(item => item.execution === `automatic`), true)
  assert.equal(new Set([...ids, ...system.items.map(item => item.id)]).size, 205)
})

test(`sample cancellation persists on the same identity and rejects ineligible actions`, async () => {
  const source = createActionEventsMock({ count: 60, userId: 1, now: () => now, simulate: false })
  const query = createActionEventsQuery()
  const page = await source.list({ query, limit: 60, signal: signal() })
  const pending = page.items.find(item => item.canCancel)!
  assert.ok(pending)
  const result = await source.cancel({ id: pending.id, signal: signal() })
  assert.equal(result.id, pending.id)
  assert.equal(result.status, `cancelled`)
  const refreshed = await source.list({ query, limit: 60, signal: signal() })
  assert.equal(refreshed.items.find(item => item.id === pending.id)?.status, `cancelled`)
  const completed = page.items.find(item => item.status === `completed`)!
  await assert.rejects(source.cancel({ id: completed.id, signal: signal() }))
})

test(`mock data covers command origins and both target kinds without generic application events`, async () => {
  const source = createActionEventsMock({ count: 60, now: () => now, simulate: false })
  const { items } = await source.list({ query: createActionEventsQuery(), limit: 100, signal: signal() })
  assert.deepEqual([...new Set(items.map(item => item.origin))].sort(), [`discord`, `spellbook`])
  assert.deepEqual([...new Set(items.map(item => item.target.type))].sort(), [`player`, `server`])
  assert.equal(items.every(item => Boolean(item.action.label && item.server.id)), true)
})

test(`aborted queries cannot advance the simulated live source`, async () => {
  let clock = now
  const source = createActionEventsMock({ count: 60, now: () => clock })
  const query = createActionEventsQuery()
  clock += 6000
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(source.list({ query, limit: 30, signal: controller.signal }))
  const result = await source.list({ query, limit: 30, signal: signal() })
  assert.equal(result.items[0].id, 61)
})

test(`a cursor still advances if its boundary request stops matching the status filter`, async () => {
  const source = createActionEventsMock({ count: 100, now: () => now, simulate: false })
  const query = { ...createActionEventsQuery(), status: `pending` as const }
  const all = await source.list({ query, limit: 100, signal: signal() })
  const index = all.items.findIndex(item => item.canCancel)
  assert.ok(index >= 0)
  const page = await source.list({ query, limit: index + 1, signal: signal() })
  await source.cancel({ id: page.items.at(-1)!.id, signal: signal() })
  const older = await source.list({ query, cursor: page.nextCursor!, limit: 100, signal: signal() })
  assert.deepEqual(older.items.map(item => item.id), all.items.slice(index + 1).map(item => item.id))
})
