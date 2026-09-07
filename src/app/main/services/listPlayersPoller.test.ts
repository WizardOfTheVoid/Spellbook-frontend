import assert from 'node:assert/strict'
import test from 'node:test'
import type { CoreCallResult } from '../types'
import { CurrentGameSnapshotStore, type CurrentGameSnapshotInput } from './currentGameSnapshotStore'
import type { ListPlayersRefresh, ListPlayersService } from './list-players-service'
import type { GameCommandDecision, GameCommandEligibility } from './gameCommandEligibility'
import { ListPlayersPoller, type ListPlayersScheduler } from './listPlayersPoller'
import type { SentinelState } from './sentinelService'

const result: CoreCallResult = { ok: true, status: 200, statusText: `OK`, data: null }
const candidate = (): CurrentGameSnapshotInput => ({
  observedAt: `2026-08-31T10:00:00.000Z`,
  gameServerId: 13,
  externalId: `lobby-13`,
  serverName: `Duel`,
  serverAddress: `127.0.0.1:7777`,
  players: [{ index: 0, name: `Player`, playfabId: `PLAYER`, rawLine: `raw` }],
  parseWarnings: []
})

test('start refreshes immediately and schedules the next normal pulse after completion', async () => {
  const scheduler = new FakeScheduler()
  const sentinel = new FakeSentinel()
  const modes: string[] = []
  const store = new CurrentGameSnapshotStore()
  const poller = createPoller(async mode => {
    modes.push(mode)
    return { result, candidate: candidate() }
  }, store, sentinel, scheduler)

  poller.start()
  await poller.refreshNow()

  assert.deepEqual(modes, [`interactive`])
  assert.equal(store.get()?.version, 1)
  assert.equal(scheduler.onlyDelay(), 20_000)

  scheduler.runOnly()
  await poller.refreshNow()

  assert.deepEqual(modes, [`interactive`, `interactive`])
  assert.equal(store.get()?.version, 2)
  assert.equal(scheduler.onlyDelay(), 20_000)
})

test('hidden idle eligibility selects background mode independently of Sentinel cadence', async () => {
  const scheduler = new FakeScheduler()
  const sentinel = new FakeSentinel()
  const eligibility = new FakeEligibility({ kind: `hidden-idle` })
  const modes: string[] = []
  const poller = createPoller(async mode => {
    modes.push(mode)
    return { result }
  }, new CurrentGameSnapshotStore(), sentinel, scheduler, eligibility)

  poller.start()
  await poller.refreshNow()
  assert.equal(scheduler.onlyDelay(), 20_000)

  sentinel.set(true)
  assert.equal(scheduler.onlyDelay(), 5_000)
  scheduler.runOnly()
  await poller.refreshNow()

  assert.deepEqual(modes, [`background`, `background`])
  assert.equal(scheduler.onlyDelay(), 5_000)
})

test('recent movement defers without Core input and schedules one short recheck', async () => {
  const scheduler = new FakeScheduler()
  const eligibility = new FakeEligibility({ kind: `defer`, reason: `movement` })
  let refreshCalls = 0
  const poller = createPoller(async () => {
    refreshCalls += 1
    return { result }
  }, new CurrentGameSnapshotStore(), new FakeSentinel(), scheduler, eligibility)

  poller.start()
  await poller.refreshNow()

  assert.equal(refreshCalls, 0)
  assert.equal(scheduler.onlyDelay(), 150)
  await poller.stop()
  assert.equal(scheduler.size, 0)
})

test('unfocused game uses normal cadence instead of a hot retry', async () => {
  const scheduler = new FakeScheduler()
  const eligibility = new FakeEligibility({ kind: `defer`, reason: `game-unfocused` })
  const poller = createPoller(async () => ({ result }), new CurrentGameSnapshotStore(), new FakeSentinel(), scheduler, eligibility)

  poller.start()
  await poller.refreshNow()

  assert.equal(scheduler.onlyDelay(), 20_000)
})

test('timer and manual refreshes share one in-flight operation and arm one timeout', async () => {
  const scheduler = new FakeScheduler()
  const pending = deferred<ListPlayersRefresh>()
  let calls = 0
  const store = new CurrentGameSnapshotStore()
  const poller = createPoller(async () => {
    calls += 1
    return pending.promise
  }, store, new FakeSentinel(), scheduler)

  poller.start()
  const first = poller.refreshNow()
  const second = poller.refreshNow()
  await Promise.resolve()
  assert.equal(calls, 1)

  pending.resolve({ result, candidate: candidate() })
  assert.equal(await first, result)
  assert.equal(await second, result)
  assert.equal(store.get()?.version, 1)
  assert.equal(scheduler.size, 1)
})

test('stop awaits in-flight work and its generation suppresses commit and rearm', async () => {
  const scheduler = new FakeScheduler()
  const pending = deferred<ListPlayersRefresh>()
  const store = new CurrentGameSnapshotStore()
  const poller = createPoller(async () => pending.promise, store, new FakeSentinel(), scheduler)

  poller.start()
  const stopping = poller.stop()
  let stopped = false
  void stopping.then(() => { stopped = true })
  await Promise.resolve()
  assert.equal(stopped, false)

  pending.resolve({ result, candidate: candidate() })
  await stopping

  assert.equal(store.get(), null)
  assert.equal(scheduler.size, 0)
  await assert.rejects(poller.refreshNow(), /not active/u)
})

test('failed attempts preserve the last good snapshot and retry on the next tick', async () => {
  const scheduler = new FakeScheduler()
  const store = new CurrentGameSnapshotStore()
  const first = store.replace(candidate())
  const poller = createPoller(async () => { throw new Error(`offline`) }, store, new FakeSentinel(), scheduler)

  poller.start()
  await assert.rejects(poller.refreshNow(), /offline/u)

  assert.equal(store.get(), first)
  assert.equal(scheduler.onlyDelay(), 20_000)
})

function createPoller(
  refresh: ListPlayersService[`refresh`],
  store: CurrentGameSnapshotStore,
  sentinel: FakeSentinel,
  scheduler: FakeScheduler,
  eligibility = new FakeEligibility({ kind: `interactive` })
): ListPlayersPoller {
  return new ListPlayersPoller(
    { refresh } as ListPlayersService,
    store,
    sentinel,
    { listPlayersPollMs: 20_000, listPlayersSentinelPollMs: 5_000 },
    eligibility as unknown as GameCommandEligibility,
    { recheckMs: 150 },
    scheduler
  )
}

class FakeEligibility {
  constructor(public decision: GameCommandDecision) {}

  async check(): Promise<GameCommandDecision> {
    return this.decision
  }
}

class FakeSentinel {
  private state: SentinelState = { enabled: false }
  private readonly listeners = new Set<(state: SentinelState) => void>()

  getState(): SentinelState {
    return this.state
  }

  subscribe(listener: (state: SentinelState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  set(enabled: boolean): void {
    this.state = { enabled }
    for (const listener of this.listeners) listener(this.state)
  }
}

class FakeScheduler implements ListPlayersScheduler {
  private nextId = 1
  private readonly timers = new Map<number, { callback: () => void, delayMs: number }>()

  get size(): number {
    return this.timers.size
  }

  setTimeout(callback: () => void, delayMs: number): number {
    const id = this.nextId++
    this.timers.set(id, { callback, delayMs })
    return id
  }

  clearTimeout(timer: unknown): void {
    this.timers.delete(Number(timer))
  }

  onlyDelay(): number {
    assert.equal(this.timers.size, 1)
    return [...this.timers.values()][0]!.delayMs
  }

  runOnly(): void {
    assert.equal(this.timers.size, 1)
    const [id, timer] = [...this.timers.entries()][0]!
    this.timers.delete(id)
    timer.callback()
  }
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(accept => { resolve = accept })
  return { promise, resolve }
}
