import assert from 'node:assert/strict'
import test from 'node:test'
import { ActionEventsFeed } from './actionEventsFeed'
import { createActionEventsMock } from './actionEventsFixtures'
import { canFollowActionEvents, createActionEventsQuery } from './actionEventsQuery'
import type { ActionEventsSource, ActionEventsState } from './actionEventsTypes'

const now = Date.parse(`2026-10-23T12:00:00Z`)

function harness(source = createActionEventsMock({ count: 300, now: () => now, simulate: false })) {
  let clock = now
  let state: ActionEventsState
  let publishedLiveEligibility = true
  const inserted: number[][] = []
  const tasks = new Set<{ at: number, run: () => void }>()
  const feed = new ActionEventsFeed(source, {
    now: () => clock,
    onChange: value => {
      state = value
      publishedLiveEligibility = canFollowActionEvents(value.query, clock)
    },
    onInsert: items => inserted.push(items.map(item => item.id)),
    schedule: (run, delay) => {
      const task = { at: clock + delay, run }
      tasks.add(task)
      return () => { tasks.delete(task) }
    }
  })
  return {
    feed, source, inserted, state: () => state!, scheduled: () => tasks.size, publishedLiveEligibility: () => publishedLiveEligibility,
    async advance(ms: number) {
      clock += ms
      for (const task of [...tasks]) if (task.at <= clock) {
        tasks.delete(task)
        task.run()
      }
      await new Promise<void>(resolve => setImmediate(resolve))
    }
  }
}

test(`live mode starts with at most 30 rows and only polls after five active seconds`, async () => {
  const h = harness()
  await h.feed.setActive(true)
  assert.equal(h.state().items.length, 30)
  assert.equal(h.inserted.length, 0)
  const initial = h.state().refreshedAt
  await h.advance(4999)
  assert.equal(h.state().refreshedAt, initial)
  await h.advance(1)
  assert.equal(h.state().refreshedAt, now + 5000)
  assert.equal(h.state().items.length, 30)
  h.feed.dispose()
})

test(`advanced filter interaction holds polls while explicit changes and Reset still fetch quietly`, async () => {
  const h = harness()
  await h.feed.setActive(true)
  h.feed.setInteraction(true)
  assert.equal(h.scheduled(), 0)
  await h.feed.setQuery(createActionEventsQuery({ systemOnly: true, servers: [1], actionTypes: [`ban`] }))
  assert.ok(h.state().total! > 0)
  assert.ok(h.state().items.every(item => !item.admin && item.server.id === 1 && item.action.commands.some(command => command.commandType === `ban`)))
  assert.equal(h.scheduled(), 0)
  await h.advance(6000)
  assert.equal(h.scheduled(), 0)
  await h.feed.setQuery(createActionEventsQuery())
  assert.equal(h.state().items.length, 30)
  assert.equal(h.inserted.length, 0)
  assert.equal(h.scheduled(), 0)
  h.feed.setInteraction(false)
  assert.equal(h.scheduled(), 1)
  h.feed.dispose()
})

test(`legacy saved queries restore with unrestricted advanced filters`, async () => {
  const h = harness()
  await h.feed.setActive(true)
  const { systemOnly, servers, sources, actionTypes, ...legacy } = h.state().query
  const saved = { ...h.state(), query: legacy } as ActionEventsState
  h.feed.restore(saved)
  assert.deepEqual(h.state().query, createActionEventsQuery())
  assert.deepEqual(h.state().items, [])
  assert.equal(h.state().nextCursor, null)
  h.feed.dispose()
})

test(`restoring removed filter options discards cached rows before fetching normalized results`, async () => {
  const h = harness()
  await h.feed.setActive(true)
  h.feed.restore({ ...h.state(), query: { ...h.state().query, sources: [`unknown`], status: `superseded` }, nextCursor: `old-cursor` })
  assert.deepEqual(h.state().query.sources, [])
  assert.equal(h.state().query.status, `all`)
  assert.deepEqual(h.state().items, [])
  assert.equal(h.state().nextCursor, null)
  h.feed.dispose()
})

test(`historical date queries load on activation without polling or resuming live`, async () => {
  const h = harness()
  const query = { ...createActionEventsQuery(), since: now - 86400000, until: now - 1000 }
  await h.feed.setQuery(query)
  await h.feed.setActive(true)
  assert.ok(h.state().items.length)
  assert.equal(h.state().mode, `browsing`)
  assert.equal(h.scheduled(), 0)
  assert.deepEqual(h.state().query, query)
  const refreshedAt = h.state().refreshedAt
  await h.advance(10000)
  await h.feed.resume()
  assert.equal(h.state().refreshedAt, refreshedAt)
  assert.equal(h.inserted.length, 0)
  h.feed.dispose()
})

test(`date bounds remain fixed across append and resume and stop polling when the end passes`, async () => {
  const h = harness()
  await h.feed.setActive(true)
  const query = { ...createActionEventsQuery(), since: now - 86400000, until: now + 15000 }
  await h.feed.setQuery(query)
  await h.feed.append()
  assert.deepEqual(h.state().query, query)
  await h.feed.resume()
  assert.equal(h.state().mode, `live`)
  await h.advance(5000)
  assert.deepEqual(h.state().query, query)
  await h.advance(10000)
  assert.equal(h.state().mode, `browsing`)
  assert.equal(h.scheduled(), 0)
  await h.feed.setQuery(createActionEventsQuery())
  assert.equal(h.state().mode, `live`)
  assert.equal(h.scheduled(), 1)
  h.feed.dispose()
})

test(`a paused date range publishes its closing boundary without polling`, async () => {
  const h = harness()
  await h.feed.setActive(true)
  await h.feed.setQuery({ ...createActionEventsQuery(), until: now + 5000 })
  h.feed.pause()
  const refreshedAt = h.state().refreshedAt
  assert.equal(h.publishedLiveEligibility(), true)
  await h.advance(5000)
  assert.equal(h.publishedLiveEligibility(), false)
  assert.equal(h.state().refreshedAt, refreshedAt)
  assert.equal(h.scheduled(), 0)
  h.feed.dispose()
})

test(`a reopened paused date range still publishes its closing boundary`, async () => {
  const h = harness()
  await h.feed.setActive(true)
  await h.feed.setQuery({ ...createActionEventsQuery(), until: now + 5000 })
  h.feed.pause()
  const refreshedAt = h.state().refreshedAt
  await h.feed.setActive(false)
  await h.advance(1000)
  await h.feed.setActive(true)
  await h.advance(4000)
  assert.equal(h.publishedLiveEligibility(), false)
  assert.equal(h.state().refreshedAt, refreshedAt)
  assert.equal(h.state().mode, `browsing`)
  h.feed.dispose()
})

test(`hidden, browsing and interacting views have no scheduled polling`, async () => {
  const h = harness()
  await h.feed.setActive(true)
  h.feed.setInteraction(true)
  assert.equal(h.scheduled(), 0)
  h.feed.setInteraction(false)
  assert.equal(h.scheduled(), 1)
  h.feed.pause()
  assert.equal(h.scheduled(), 0)
  await h.feed.setActive(false)
  await h.advance(20_000)
  await h.feed.setActive(true)
  assert.equal(h.state().mode, `browsing`)
  assert.equal(h.scheduled(), 0)
  h.feed.dispose()
})

test(`history appends 100 rows and resume discards old pages to exactly 30`, async () => {
  const h = harness()
  await h.feed.setActive(true)
  await h.feed.append()
  assert.equal(h.state().items.length, 130)
  assert.equal(new Set(h.state().items.map(item => item.id)).size, 130)
  assert.equal(h.state().mode, `browsing`)
  await h.feed.resume()
  assert.equal(h.state().items.length, 30)
  assert.equal(h.state().mode, `live`)
  assert.equal(h.inserted.length, 0)
  h.feed.dispose()
})

test(`resume failure preserves history and can be retried`, async () => {
  const base = createActionEventsMock({ count: 300, now: () => now, simulate: false })
  let fail = false
  const h = harness({ ...base, async list(input) {
    if (fail) throw new Error(`offline`)
    return base.list(input)
  } })
  await h.feed.setActive(true)
  await h.feed.append()
  fail = true
  await h.feed.resume()
  assert.equal(h.state().items.length, 130)
  assert.equal(h.state().mode, `browsing`)
  assert.equal(h.state().failedOperation, `resume`)
  fail = false
  await h.feed.retry()
  assert.equal(h.state().items.length, 30)
  assert.equal(h.state().error, ``)
  h.feed.dispose()
})

test(`obsolete query responses cannot replace a later query even if the source ignores abort`, async () => {
  const base = createActionEventsMock({ count: 60, now: () => now, simulate: false })
  const delayed = Promise.withResolvers<Awaited<ReturnType<ActionEventsSource[`list`]>>>()
  let first = true
  const h = harness({ ...base, async list(input) {
    if (first) {
      first = false
      return delayed.promise
    }
    return base.list(input)
  } })
  const old = h.feed.setActive(true)
  await h.feed.setQuery({ ...createActionEventsQuery(), search: `sample-00002` })
  assert.deepEqual(h.state().items.map(item => item.id), [2])
  delayed.resolve(await base.list({ query: createActionEventsQuery(), limit: 30, signal: new AbortController().signal }))
  await old
  assert.deepEqual(h.state().items.map(item => item.id), [2])
  h.feed.dispose()
})

test(`pausing discards an in-flight poll and further timer ticks cannot overlap it`, async () => {
  const base = createActionEventsMock({ count: 60, now: () => now, simulate: false })
  const delayed = Promise.withResolvers<Awaited<ReturnType<ActionEventsSource[`list`]>>>()
  let calls = 0
  const h = harness({ ...base, async list(input) {
    calls++
    return calls === 1 ? base.list(input) : delayed.promise
  } })
  await h.feed.setActive(true)
  await h.advance(5000)
  await h.advance(20_000)
  assert.equal(calls, 2)
  h.feed.pause()
  delayed.resolve({ items: [], nextCursor: null })
  await h.advance(0)
  assert.equal(h.state().items.length, 30)
  assert.equal(h.state().mode, `browsing`)
  h.feed.dispose()
})

test(`new live insertions cue once, existing status changes and visibility catch-up are silent`, async () => {
  let clock = now
  const source = createActionEventsMock({ count: 60, now: () => clock })
  const h = harness(source)
  await h.feed.setActive(true)
  clock += 5000
  await h.advance(5000)
  assert.deepEqual(h.inserted, [[61]])
  await h.advance(5000)
  assert.deepEqual(h.inserted, [[61]])
  await h.feed.setActive(false)
  clock += 5000
  await h.feed.setActive(true)
  assert.deepEqual(h.inserted, [[61]])
  h.feed.dispose()
})

test(`Wanted status refreshes keep one card and do not cue another arrival`, async () => {
  const source = createActionEventsMock({ count: 1, now: () => now, simulate: false })
  const initial = await source.list({ query: createActionEventsQuery(), limit: 30, signal: new AbortController().signal })
  let event = { ...initial.items[0], admin: null, origin: `spellbook` as const, execution: `automatic` as const }
  source.list = async () => ({ items: [event], total: 1, nextCursor: null })
  const h = harness(source)
  await h.feed.setActive(true)
  for (const status of [`pending`, `failed`, `completed`] as const) {
    event = { ...event, status }
    await h.advance(5000)
    assert.deepEqual(h.state().items.map(item => ({ id: item.id, status: item.status })), [{ id: event.id, status }])
    assert.equal(h.state().total, 1)
    assert.deepEqual(h.inserted, [])
  }
  h.feed.dispose()
})

test(`cancellation changes the same card and removes it from a Pending-only query`, async () => {
  const h = harness()
  await h.feed.setQuery({ ...createActionEventsQuery(), status: `pending` })
  await h.feed.setActive(true)
  const pending = h.state().items.find(item => item.canCancel)!
  assert.ok(pending)
  await h.feed.cancel(pending.id)
  assert.equal(h.state().items.some(item => item.id === pending.id), false)
  assert.deepEqual(h.state().pendingIds, [])
  assert.equal(h.inserted.length, 0)
  h.feed.dispose()
})

test(`cancellation preserves server search matches instead of applying mock search rules`, async () => {
  const base = createActionEventsMock({ count: 60, now: () => now, simulate: false })
  const page = await base.list({ query: createActionEventsQuery(), limit: 60, signal: new AbortController().signal })
  const pending = page.items.find(item => item.canCancel)!
  const h = harness({ ...base, list: async () => ({ items: [pending], nextCursor: null, total: 1 }),
    cancel: async () => ({ ...pending, status: `cancelled`, canCancel: false }) })
  await h.feed.setQuery({ ...createActionEventsQuery(), search: `Match made by server collation` })
  await h.feed.setActive(true)
  await h.feed.cancel(pending.id)
  assert.equal(h.state().items[0]?.status, `cancelled`)
  assert.equal(h.state().total, 1)
  h.feed.dispose()
})

test(`cancellation failure retains the pending card and an unavailable action is never sent`, async () => {
  const base = createActionEventsMock({ count: 60, now: () => now, simulate: false })
  let sent = 0
  const h = harness({ ...base, async cancel() {
    sent++
    throw new Error(`state changed`)
  } })
  await h.feed.setQuery({ ...createActionEventsQuery(), status: `pending` })
  await h.feed.setActive(true)
  const pending = h.state().items.find(item => item.canCancel)!
  await h.feed.cancel(pending.id)
  assert.equal(h.state().items.find(item => item.id === pending.id)?.canCancel, true)
  assert.ok(h.state().error)
  await h.feed.cancel(h.state().items.find(item => !item.canCancel)!.id)
  assert.equal(sent, 1)
  h.feed.dispose()
})

test(`restoring a browsing session keeps loaded history without replaying its pages`, async () => {
  const h = harness()
  await h.feed.setActive(true)
  await h.feed.append()
  const saved = h.state()
  await h.feed.setQuery({ ...saved.query, search: `sample-00002` })
  assert.equal(h.state().items.length, 1)
  h.feed.restore(saved)
  assert.equal(h.state().items.length, 130)
  assert.equal(h.state().mode, `browsing`)
  assert.equal(h.scheduled(), 0)
  h.feed.dispose()
})

test(`older rows filling a cancelled Pending result do not announce new actions`, async () => {
  const h = harness()
  await h.feed.setQuery({ ...createActionEventsQuery(), status: `pending` })
  await h.feed.setActive(true)
  const pending = h.state().items.find(item => item.canCancel)!
  await h.feed.cancel(pending.id)
  await h.advance(5000)
  assert.equal(h.state().items.length, 30)
  assert.equal(h.inserted.length, 0)
  h.feed.dispose()
})

test(`cancellation discards a stale in-flight resume response`, async () => {
  const base = createActionEventsMock({ count: 300, now: () => now, simulate: false })
  const delayed = Promise.withResolvers<Awaited<ReturnType<ActionEventsSource[`list`]>>>()
  let delayList = false
  const h = harness({ ...base, async list(input) { return delayList ? delayed.promise : base.list(input) } })
  await h.feed.setActive(true)
  h.feed.pause()
  const pending = h.state().items.find(item => item.canCancel)!
  const oldPage = await base.list({ query: h.state().query, limit: 30, signal: new AbortController().signal })
  delayList = true
  const resuming = h.feed.resume()
  await h.feed.cancel(pending.id)
  delayed.resolve(oldPage)
  await resuming
  assert.equal(h.state().items.find(item => item.id === pending.id)?.status, `cancelled`)
  assert.equal(h.state().mode, `browsing`)
  h.feed.dispose()
})
