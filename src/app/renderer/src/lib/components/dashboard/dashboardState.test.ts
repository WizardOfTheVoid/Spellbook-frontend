import assert from 'node:assert/strict'
import test from 'node:test'
import { createDashboardState } from './dashboardState'

const query = { environment: `global`, period: `30Days`, timeline: `playerActions` } as const
const snapshot = (selected = query) => ({ query: selected, generatedAt: `2026-09-29T12:00:00Z` }) as any
const flush = async () => {
  let index = 0
  while (index++ < 8) await Promise.resolve()
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

function fakeClock() {
  let now = 0
  let id = 0
  const timers = new Map<number, { at: number, run: () => void }>()
  return {
    now: () => now,
    setTimeout: (run: () => void, ms: number) => {
      timers.set(++id, { at: now + ms, run })
      return id
    },
    clearTimeout: (key: unknown) => { timers.delete(key as number) },
    advance: async (ms: number) => {
      const target = now + ms
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0]
        if (!next) break
        now = next[1].at
        timers.delete(next[0])
        next[1].run()
        await flush()
      }
      now = target
      await flush()
    },
    size: () => timers.size,
  }
}

test(`refreshes at five seconds, skips overlapping loads, and cancels on destroy`, async () => {
  const clock = fakeClock()
  const pending = deferred<any>()
  let requests = 0
  const controller = createDashboardState({ query, clock, source: { load: async () => ++requests === 1 ? snapshot() : await pending.promise }, onChange: () => {} })
  await controller.start()
  assert.equal(requests, 1)
  await clock.advance(4999)
  assert.equal(requests, 1)
  await clock.advance(1)
  assert.equal(requests, 2)
  await clock.advance(5000)
  assert.equal(requests, 2)
  controller.destroy()
  pending.resolve(snapshot())
  await flush()
  assert.equal(clock.size(), 0)
})

test(`rejects an obsolete Global result and immediately requests the latest selection`, async () => {
  const pending = deferred<any>()
  const selections: any[] = []
  const states: any[] = []
  const selected = { ...query, environment: `team` } as const
  const controller = createDashboardState({ query, clock: fakeClock(), source: { load: async (value: any) => {
    selections.push(value)
    return selections.length === 1 ? await pending.promise : snapshot(value)
  } }, onChange: (value: any) => states.push(value) })
  const first = controller.start()
  void controller.setQuery(selected)
  assert.equal(selections.length, 1)
  pending.resolve(snapshot())
  await first
  await flush()
  assert.equal(selections.length, 2)
  assert.equal(states.at(-1).data.query.environment, `team`)
  assert.equal(states.some(state => state.query.environment === `team` && state.data?.query.environment === `global`), false)
  controller.destroy()
})

test(`keeps matching data on failed refresh and never reuses it for a different scope`, async () => {
  let fail = false
  const states: any[] = []
  const controller = createDashboardState({ query, clock: fakeClock(), source: { load: async (value: any) => {
    if (fail) throw new Error(`Offline`)
    return snapshot(value)
  } }, onChange: (value: any) => states.push(value) })
  await controller.start()
  fail = true
  await controller.refresh()
  assert.equal(states.at(-1).data.query.environment, `global`)
  assert.equal(states.at(-1).error, `Offline`)
  await controller.setQuery({ ...query, environment: `you` })
  assert.equal(states.at(-1).data, null)
  controller.destroy()
})

test(`keeps loaded content visible until a changed selection finishes loading`, async () => {
  const next = deferred<any>()
  const states: any[] = []
  const selected = { ...query, timeline: `protectedServers` } as const
  let requests = 0
  const controller = createDashboardState({ query, clock: fakeClock(), source: { load: async () => ++requests === 1 ? snapshot() : await next.promise }, onChange: value => states.push(value) })
  await controller.start()
  const displayed = states.at(-1).data
  const changing = controller.setQuery(selected)
  assert.equal(states.at(-1).loading, true)
  assert.deepEqual(states.at(-1).query, selected)
  assert.equal(states.at(-1).data, displayed)
  next.resolve({ ...snapshot(), query: selected })
  await changing
  assert.equal(states.at(-1).loading, false)
  assert.deepEqual(states.at(-1).data.query, selected)
  controller.destroy()
})

test(`keeps the displayed snapshot through rapid selection changes and ignores obsolete results`, async () => {
  const obsolete = deferred<any>()
  const current = deferred<any>()
  const states: any[] = []
  let requests = 0
  const controller = createDashboardState({ query, clock: fakeClock(), source: { load: async () => {
    requests++
    return requests === 1 ? snapshot() : await (requests === 2 ? obsolete.promise : current.promise)
  } }, onChange: value => states.push(value) })
  await controller.start()
  const displayed = states.at(-1).data
  const team = { ...query, environment: `team` } as const
  const you = { ...query, environment: `you` } as const
  const changing = controller.setQuery(team)
  void controller.setQuery(you)
  assert.equal(states.at(-1).data, displayed)
  obsolete.resolve({ ...snapshot(), query: team })
  await flush()
  assert.equal(states.at(-1).data, displayed)
  assert.equal(states.at(-1).loading, true)
  current.resolve({ ...snapshot(), query: you })
  await changing
  assert.deepEqual(states.at(-1).data.query, you)
  assert.equal(states.at(-1).loading, false)
  controller.destroy()
})

test(`pauses when hidden and loads immediately on resume`, async () => {
  const clock = fakeClock()
  let requests = 0
  const controller = createDashboardState({ query, clock, source: { load: async () => {
    requests++
    return snapshot()
  } }, onChange: () => {} })
  await controller.start()
  controller.setVisible(false)
  await clock.advance(20000)
  assert.equal(requests, 1)
  controller.setVisible(true)
  await flush()
  assert.equal(requests, 2)
  controller.destroy()
})

test(`destroying during a request discards its result and queued selection without restarting timers`, async () => {
  const clock = fakeClock()
  const pending = deferred<any>()
  const states: any[] = []
  let requests = 0
  const controller = createDashboardState({ query, clock, source: { load: async () => {
    requests++
    return await pending.promise
  } }, onChange: value => states.push(value) })
  const loading = controller.start()
  void controller.setQuery({ ...query, environment: `team` })
  controller.destroy()
  const published = states.length
  pending.resolve(snapshot())
  await loading
  await clock.advance(20000)
  assert.equal(requests, 1)
  assert.equal(states.length, published)
  assert.equal(clock.size(), 0)
})
