import assert from 'node:assert/strict'
import test from 'node:test'
import type { DashboardSnapshot } from '$lib/core'
import { createDashboardController, type DashboardViewState } from './dashboardState'

const snapshot = {
  generatedAt: `2026-09-02T12:00:00.000Z`,
  yourServers: { online: 0, total: 0, players: 0 },
  latestActions: { total24Hours: 0, buckets: [0, 0, 0, 0, 0, 0] },
  yourBans: { local: 0, wantedActions: 0, total: 0 },
  global: {
    localBans: 0,
    wantedActions: 0,
    wantedServerApplications: 0,
    playerActions: 0,
    activeAdmins: 0,
    activeTeams: 0,
  },
  timeline: {
    bucketStarts: [
      `2026-08-20T00:00:00.000Z`,
      `2026-08-22T00:00:00.000Z`,
      `2026-08-24T00:00:00.000Z`,
      `2026-08-26T00:00:00.000Z`,
      `2026-08-28T00:00:00.000Z`,
      `2026-08-30T00:00:00.000Z`,
      `2026-09-01T00:00:00.000Z`,
    ],
    series: [
      { id: `user:7`, label: `Magic`, kind: `user`, values: [0, 0, 0, 0, 0, 0, 0] },
      { id: `global-average`, label: `Global average`, kind: `global-average`, values: [0, 0, 0, 0, 0, 0, 0] },
    ],
  },
  leaderboards: { individuals: [], teams: [] },
  recentActions: { bans: [], kicks: [], unbans: [] },
} as DashboardSnapshot

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

function createFakeClock(start = Date.parse(`2026-09-02T12:00:00.000Z`)) {
  let now = start
  let nextId = 0
  const timers = new Map<number, { at: number; callback: () => void }>()
  const clock = {
    now: () => now,
    setTimeout: (callback: () => void, delay: number) => {
      const id = ++nextId
      timers.set(id, { at: now + delay, callback })
      return id
    },
    clearTimeout: (id: unknown) => timers.delete(id as number),
  }
  const advance = async (duration: number) => {
    const target = now + duration
    while (true) {
      const next = [...timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((left, right) => left[1].at - right[1].at)[0]
      if (!next) break
      now = next[1].at
      timers.delete(next[0])
      next[1].callback()
      await Promise.resolve()
    }
    now = target
    await Promise.resolve()
  }
  return { clock, advance, pending: () => timers.size }
}

test(`emits loading and then populated data`, async () => {
  const states: DashboardViewState[] = []
  const { clock } = createFakeClock()
  const controller = createDashboardController({ request: async () => snapshot, clock, onChange: state => states.push(state) })

  await controller.load()

  assert.equal(states[0]?.loading, true)
  assert.equal(states[1]?.loading, false)
  assert.ok(states[1]?.data)
  assert.equal(states.at(-1)?.secondsUntilRefresh, 20)
})

test(`counts down and refreshes every 20 seconds`, async () => {
  const states: DashboardViewState[] = []
  let calls = 0
  const { clock, advance } = createFakeClock()
  const controller = createDashboardController({
    request: async () => {
      calls += 1
      return snapshot
    },
    clock,
    onChange: state => states.push(state),
  })

  await controller.load()
  await advance(1_000)
  assert.equal(states.at(-1)?.secondsUntilRefresh, 19)
  await advance(19_000)
  assert.equal(calls, 2)
  assert.equal(states.at(-1)?.secondsUntilRefresh, 20)
})

test(`does not overlap requests and preserves data after a background failure`, async () => {
  const pending = deferred<DashboardSnapshot>()
  const states: DashboardViewState[] = []
  let calls = 0
  const { clock, advance } = createFakeClock()
  const controller = createDashboardController({
    request: async () => {
      calls += 1
      if (calls === 1) return snapshot
      if (calls === 2) return pending.promise
      throw new Error(`Dashboard unavailable.`)
    },
    clock,
    onChange: state => states.push(state),
  })

  await controller.load()
  await advance(20_000)
  void controller.load()
  assert.equal(calls, 2)
  pending.reject(new Error(`Dashboard unavailable.`))
  await Promise.resolve()
  await Promise.resolve()

  assert.ok(states.at(-1)?.data)
  assert.equal(states.at(-1)?.error, `Dashboard unavailable.`)
  assert.equal(states.at(-1)?.secondsUntilRefresh, 20)
})

test(`emits nothing after destruction`, async () => {
  const pending = deferred<DashboardSnapshot>()
  const states: DashboardViewState[] = []
  const { clock, advance, pending: pendingTimers } = createFakeClock()
  const controller = createDashboardController({ request: () => pending.promise, clock, onChange: state => states.push(state) })

  const load = controller.load()
  controller.destroy()
  pending.resolve(snapshot)
  await load

  assert.equal(states.length, 1)
  await advance(30_000)
  assert.equal(pendingTimers(), 0)
})
