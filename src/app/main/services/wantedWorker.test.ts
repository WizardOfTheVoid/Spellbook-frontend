import assert from 'node:assert/strict'
import test from 'node:test'
import type { CoreCallResult } from '../types'
import { CurrentGameSnapshotStore, type CurrentGameSnapshotInput } from './currentGameSnapshotStore'
import type { GameCommandDecision } from './gameCommandEligibility'
import type { WantedExecutionMode, WantedExecutionResult } from './wantedCoreExecutor'
import type { ResolvedWantedMessages } from './wantedMessageResolver'
import type { SentinelState } from './sentinelService'
import {
  WantedWorker,
  type WantedScheduler,
  type WantedWorkerDependencies
} from './wantedWorker'
import type {
  WantedClaim,
  WantedMessageContext,
  WantedWork,
  WantedWorkPage
} from './wantedWorkClient'

const inactive: CoreCallResult = {
  ok: false,
  status: 409,
  statusText: `OVERLAY_INACTIVE`,
  data: null,
  error: { code: `OVERLAY_INACTIVE`, message: `Overlay inactive` }
}
const context: WantedMessageContext = {
  admin: `Admin`,
  serverName: `Duel`,
  clanName: `Clan`,
  clanTag: `SB`,
  variables: []
}

test(`no snapshot makes no Server call and schedules the next normal pulse`, async () => {
  let workCalls = 0
  const harness = createHarness({ listWork: async () => {
    workCalls += 1
    return page()
  } })

  harness.worker.start()
  await harness.worker.runNow()

  assert.equal(workCalls, 0)
  assert.equal(harness.scheduler.onlyDelay(), 6_000)
})

test(`empty presence still fetches and executes presence-free unban`, async () => {
  const calls: unknown[] = []
  const unban = work({ actionType: `unban`, offenseType: null })
  const harness = createHarness({
    listWork: async current => {
      calls.push([`work`, current.gameServerId, current.players.map(player => player.playfabId)])
      return page([unban])
    },
    resolve: (_work, _context, name) => {
      calls.push([`resolve`, name])
      return { automaticReason: `[SB] Player unbanned` }
    },
    claim: async () => {
      calls.push([`claim`])
      return claim()
    },
    execute: async (_work, _messages, mode) => {
      calls.push([`execute`, mode])
      return { ok: true }
    },
    complete: async (_claim, reason) => { calls.push([`complete`, reason]) }
  })
  harness.snapshots.replace(snapshot([]))

  harness.worker.start()
  await harness.worker.runNow()

  assert.deepEqual(calls, [
    [`work`, 13, []],
    [`resolve`, `PLAYER_1`],
    [`claim`],
    [`resolve`, `PLAYER_1`],
    [`execute`, `interactive`],
    [`complete`, `[SB] Player unbanned`]
  ])
})

test(`timer and manual runs share one completion-scheduled pulse and Sentinel rearms it`, async () => {
  const pending = deferred<WantedWorkPage>()
  let workCalls = 0
  const harness = createHarness({ listWork: async () => {
    workCalls += 1
    return workCalls === 1 ? pending.promise : page()
  } })
  harness.snapshots.replace(snapshot())

  harness.worker.start()
  const first = harness.worker.runNow()
  const second = harness.worker.runNow()
  assert.equal(first, second)
  assert.equal(workCalls, 1)
  assert.equal(harness.scheduler.size, 0)

  harness.sentinel.set(true)
  assert.equal(harness.scheduler.size, 0)
  pending.resolve(page())
  await first
  assert.equal(harness.scheduler.onlyDelay(), 3_000)

  harness.sentinel.set(false)
  assert.equal(harness.scheduler.onlyDelay(), 6_000)
  harness.sentinel.set(true)
  assert.equal(harness.scheduler.onlyDelay(), 3_000)
  harness.scheduler.runOnly()
  await harness.worker.runNow()

  assert.equal(workCalls, 2)
  assert.equal(harness.scheduler.onlyDelay(), 3_000)
})

test(`normal ineligibility returns before claiming`, async () => {
  let claims = 0
  let executions = 0
  const harness = createHarness({
    listWork: async () => page([work()]),
    guard: () => inactive,
    claim: async () => { claims += 1; return claim() },
    execute: async () => { executions += 1; return { ok: true } }
  })
  harness.snapshots.replace(snapshot())

  harness.worker.start()
  await harness.worker.runNow()

  assert.equal(claims, 0)
  assert.equal(executions, 0)
})

test(`execution mode is eligibility-owned even when Sentinel cadence changes`, async () => {
  const modes: WantedExecutionMode[] = []
  let claims = 0
  let guardChecks = 0
  const harness = createHarness({
    listWork: async () => page([
      work({ actionType: `mock` }),
      work({ wantedId: 8, sourceActionId: 42, actionType: `mock` })
    ]),
    guard: () => {
      guardChecks += 1
      return null
    },
    claim: async item => {
      claims += 1
      if (claims === 1) harness.sentinel.set(true)
      return claim({ wantedId: item.wantedId, sourceActionId: item.sourceActionId })
    },
    execute: async (_work, _messages, mode) => {
      modes.push(mode)
      return { ok: true }
    }
  })
  harness.snapshots.replace(snapshot())

  harness.worker.start()
  await harness.worker.runNow()

  assert.deepEqual(modes, [`interactive`, `interactive`])
  assert.equal(guardChecks, 4)
})

test(`hidden idle eligibility executes in background without overlay guards`, async () => {
  const modes: WantedExecutionMode[] = []
  let guardChecks = 0
  const harness = createHarness({
    listWork: async () => page([work()]),
    eligibility: async () => ({ kind: `hidden-idle` }),
    guard: () => {
      guardChecks += 1
      return null
    },
    execute: async (_work, _messages, mode) => {
      modes.push(mode)
      return { ok: true }
    }
  })
  harness.snapshots.replace(snapshot())

  harness.worker.start()
  await harness.worker.runNow()

  assert.deepEqual(modes, [`background`])
  assert.equal(guardChecks, 0)
})

test(`recent movement defers before claim and schedules one short recheck`, async () => {
  const harness = createHarness({
    listWork: async () => page([work()]),
    eligibility: async () => ({ kind: `defer`, reason: `movement` })
  })
  harness.snapshots.replace(snapshot())

  harness.worker.start()
  await harness.worker.runNow()

  assert.equal(harness.calls.claim, 0)
  assert.equal(harness.scheduler.onlyDelay(), 150)
  await harness.worker.stop()
  assert.equal(harness.scheduler.size, 0)
})

test(`re-reads same-server names before every sequential claim`, async () => {
  const first = work({ actionType: `mock` })
  const second = work({ wantedId: 8, sourceActionId: 42, actionType: `mock` })
  const workResponse = deferred<WantedWorkPage>()
  const events: unknown[] = []
  let completed = 0
  const harness = createHarness({
    listWork: async () => workResponse.promise,
    resolve: (item, _context, name) => {
      events.push([`resolve`, item.wantedId, name])
      return messages(item.wantedId)
    },
    claim: async item => {
      events.push([`claim`, item.wantedId])
      return claim({
        id: item.wantedId,
        wantedId: item.wantedId,
        sourceActionId: item.sourceActionId
      })
    },
    execute: async item => {
      events.push([`execute`, item.wantedId])
      return { ok: true }
    },
    complete: async itemClaim => {
      events.push([`complete`, itemClaim.wantedId])
      completed += 1
      if (completed === 1) harness.snapshots.replace(snapshot(player(`Newest Name`)))
    }
  })
  harness.snapshots.replace(snapshot(player(`Old Name`)))

  harness.worker.start()
  harness.snapshots.replace(snapshot(player(`Fresh Name`)))
  workResponse.resolve(page([first, second]))
  await harness.worker.runNow()

  assert.deepEqual(events, [
    [`resolve`, 7, `Fresh Name`],
    [`claim`, 7],
    [`resolve`, 7, `Fresh Name`],
    [`execute`, 7],
    [`complete`, 7],
    [`resolve`, 8, `Newest Name`],
    [`claim`, 8],
    [`resolve`, 8, `Newest Name`],
    [`execute`, 8],
    [`complete`, 8]
  ])
})

test(`re-resolves exact post-claim player text before Core and completion`, async () => {
  const pendingClaim = deferred<WantedClaim | null>()
  const oldName = `Old Name`
  const freshName = ` \tFresh \u73a9\u5bb6 "Name"\t `
  const resolvedNames: string[] = []
  const executed: ResolvedWantedMessages[] = []
  const completed: string[] = []
  const harness = createHarness({
    listWork: async () => page([work()]),
    resolve: (_item, _messageContext, name) => {
      resolvedNames.push(name ?? ``)
      return {
        automaticReason: `[SB] reason for ${name}`,
        banAnnouncement: `[SB] announcement for ${name}`,
        mockAdminsay: `[SB] mock for ${name}`
      }
    },
    claim: async () => pendingClaim.promise,
    execute: async (_item, itemMessages) => {
      executed.push(itemMessages)
      return { ok: true }
    },
    complete: async (_itemClaim, automaticReason) => {
      completed.push(automaticReason)
    }
  })
  harness.snapshots.replace(snapshot(player(oldName)))
  harness.worker.start()
  const running = harness.worker.runNow()
  await until(() => harness.calls.claim === 1)

  assert.deepEqual(resolvedNames, [oldName])
  harness.snapshots.replace(snapshot(player(freshName)))
  pendingClaim.resolve(claim())
  await running

  assert.deepEqual(resolvedNames, [oldName, freshName])
  assert.deepEqual(executed, [{
    automaticReason: `[SB] reason for  \tFresh \u73a9\u5bb6 "Name"\t `,
    banAnnouncement: `[SB] announcement for  \tFresh \u73a9\u5bb6 "Name"\t `,
    mockAdminsay: `[SB] mock for  \tFresh \u73a9\u5bb6 "Name"\t `
  }])
  assert.deepEqual(completed, [`[SB] reason for  \tFresh \u73a9\u5bb6 "Name"\t `])
})

test(`changed server ends the tick while missing presence skips ban but not unban`, async () => {
  let claims = 0
  const changed = createHarness({
    listWork: async () => {
      changed.snapshots.replace(snapshot(undefined, `Other`, 14))
      return page([work()])
    },
    claim: async () => { claims += 1; return claim() }
  })
  changed.snapshots.replace(snapshot())
  changed.worker.start()
  await changed.worker.runNow()
  assert.equal(claims, 0)

  const claimed: string[] = []
  const absent = createHarness({
    listWork: async () => page([
      work({ playfabId: `ABSENT` }),
      work({ wantedId: 8, sourceActionId: 42, playfabId: `ABSENT`, actionType: `unban`, offenseType: null })
    ]),
    claim: async item => {
      claimed.push(item.actionType)
      return claim({ wantedId: item.wantedId, sourceActionId: item.sourceActionId })
    }
  })
  absent.snapshots.replace(snapshot([]))
  absent.worker.start()
  await absent.worker.runNow()
  assert.deepEqual(claimed, [`unban`])
})

test(`an ambiguous or mismatched claim never executes and is never failed`, async () => {
  let executions = 0
  let failures = 0
  const harness = createHarness({
    listWork: async () => page([work()]),
    claim: async () => { throw new Error(`Malformed claim correlation`) },
    execute: async () => { executions += 1; return { ok: true } },
    fail: async () => { failures += 1 }
  })
  harness.snapshots.replace(snapshot())

  harness.worker.start()
  await harness.worker.runNow()

  assert.equal(executions, 0)
  assert.equal(failures, 0)
})

test(`post-claim normal guard loss releases the trusted claim without Core input`, async () => {
  let guardChecks = 0
  let executions = 0
  const failures: unknown[] = []
  const harness = createHarness({
    listWork: async () => page([work()]),
    guard: () => ++guardChecks === 1 ? null : inactive,
    execute: async () => { executions += 1; return { ok: true } },
    fail: async (...input) => { failures.push(input) }
  })
  harness.snapshots.replace(snapshot())

  harness.worker.start()
  await harness.worker.runNow()

  assert.equal(guardChecks, 2)
  assert.equal(executions, 0)
  assert.equal(failures.length, 1)
})

test(`post-claim message rejection fails the trusted claim and ends the tick`, async () => {
  let resolutions = 0
  let executions = 0
  let completions = 0
  const failures: unknown[] = []
  const harness = createHarness({
    listWork: async () => page([work(), work({ wantedId: 8, sourceActionId: 42 })]),
    resolve: () => {
      resolutions += 1
      if (resolutions === 1) return messages()
      throw new Error(`Resolved output exceeded its bound.`)
    },
    execute: async () => { executions += 1; return { ok: true } },
    complete: async () => { completions += 1 },
    fail: async (_itemClaim, failure) => {
      failures.push(failure)
      throw new Error(`claim release unavailable`)
    }
  })
  harness.snapshots.replace(snapshot())

  harness.worker.start()
  await harness.worker.runNow()

  assert.equal(resolutions, 2)
  assert.equal(harness.calls.claim, 1)
  assert.equal(executions, 0)
  assert.equal(completions, 0)
  assert.deepEqual(failures, [{
    code: `WANTED_PRE_SUBMISSION_FAILED`,
    message: `Wanted action failed before Core submission.`
  }])
})

test(`executor rejection fails the trusted claim with a bounded deterministic reason`, async () => {
  const events: unknown[] = []
  const harness = createHarness({
    listWork: async () => page([work(), work({ wantedId: 8, sourceActionId: 42 })]),
    claim: async item => {
      events.push([`claim`, item.wantedId])
      return claim({ wantedId: item.wantedId, sourceActionId: item.sourceActionId })
    },
    execute: async item => {
      events.push([`execute`, item.wantedId])
      throw new Error(`sensitive runtime detail ${`x`.repeat(1_000)}`)
    },
    fail: async (itemClaim, failure) => {
      events.push([`fail`, itemClaim.wantedId, failure])
      throw new Error(`claim release unavailable`)
    },
    complete: async () => { events.push([`unexpected complete`]) }
  })
  harness.snapshots.replace(snapshot())

  harness.worker.start()
  await harness.worker.runNow()

  assert.deepEqual(events, [
    [`claim`, 7],
    [`execute`, 7],
    [`fail`, 7, {
      code: `WANTED_PRE_SUBMISSION_FAILED`,
      message: `Wanted action failed before Core submission.`
    }]
  ])
  assert.equal(harness.calls.claim, 1)
})

test(`known Core failure fails once and ends the tick`, async () => {
  const events: unknown[] = []
  const harness = createHarness({
    listWork: async () => page([work(), work({ wantedId: 8, sourceActionId: 42 })]),
    claim: async item => {
      events.push([`claim`, item.wantedId])
      return claim({ wantedId: item.wantedId, sourceActionId: item.sourceActionId })
    },
    execute: async () => ({
      ok: false,
      failure: { code: `INPUT_FAILED`, message: `Core failed` }
    }),
    fail: async (_claim, failure) => { events.push([`fail`, failure]) },
    complete: async () => { events.push([`unexpected complete`]) }
  })
  harness.snapshots.replace(snapshot())

  harness.worker.start()
  await harness.worker.runNow()

  assert.deepEqual(events, [
    [`claim`, 7],
    [`fail`, { code: `INPUT_FAILED`, message: `Core failed` }]
  ])
})

test(`confirmed ban records the durable attempt and refreshes ListPlayers without direct completion`, async () => {
  const events: unknown[] = []
  const harness = createHarness({
    listWork: async () => page([work({ cycleRevision: 4, attemptNumber: 2, announce: false })]),
    recordAttempt: async (_claim, item, reason) => {
      events.push([`attempt`, item.cycleRevision, item.attemptNumber, reason])
    },
    refreshNow: async () => {
      events.push([`listplayers`])
      return { ok: true, status: 200, statusText: `OK`, data: null }
    },
    complete: async () => { events.push([`unexpected complete`]) }
  })
  harness.snapshots.replace(snapshot())

  harness.worker.start()
  await harness.worker.runNow()

  assert.deepEqual(events, [
    [`attempt`, 4, 2, `[SB] reason 7`],
    [`listplayers`]
  ])
})

test(`ambiguous completion after Core success never fails or advances`, async () => {
  const events: unknown[] = []
  const harness = createHarness({
    listWork: async () => page([work(), work({ wantedId: 8, sourceActionId: 42 })]),
    claim: async item => {
      events.push([`claim`, item.wantedId])
      return claim({ wantedId: item.wantedId, sourceActionId: item.sourceActionId })
    },
    execute: async () => {
      events.push([`execute`])
      return { ok: true }
    },
    complete: async () => {
      events.push([`complete`])
      throw new Error(`response lost`)
    },
    fail: async () => { events.push([`unexpected fail`]) }
  })
  harness.snapshots.replace(snapshot())

  harness.worker.start()
  await harness.worker.runNow()

  assert.deepEqual(events, [[`claim`, 7], [`execute`], [`complete`]])
})

test(`stop during work invalidates immediately and awaits the response without claiming`, async () => {
  const pending = deferred<WantedWorkPage>()
  let claims = 0
  const harness = createHarness({
    listWork: async () => pending.promise,
    claim: async () => { claims += 1; return claim() }
  })
  harness.snapshots.replace(snapshot())
  harness.worker.start()

  const stopping = harness.worker.stop()
  assert.equal(harness.scheduler.size, 0)
  assert.equal(await settles(stopping), false)
  pending.resolve(page([work()]))
  await stopping

  assert.equal(claims, 0)
})

test(`stop during claim fails a trusted returned lease before settling`, async () => {
  const pending = deferred<WantedClaim | null>()
  const events: string[] = []
  const harness = createHarness({
    listWork: async () => page([work()]),
    claim: async () => pending.promise,
    execute: async () => { events.push(`unexpected execute`); return { ok: true } },
    fail: async () => { events.push(`fail`) }
  })
  harness.snapshots.replace(snapshot())
  harness.worker.start()
  await until(() => harness.calls.claim === 1)

  const stopping = harness.worker.stop()
  pending.resolve(claim())
  await stopping

  assert.deepEqual(events, [`fail`])
})

test(`stop during Core awaits its result and completion settlement`, async () => {
  const core = deferred<WantedExecutionResult>()
  const complete = deferred<void>()
  const events: string[] = []
  const harness = createHarness({
    listWork: async () => page([work()]),
    execute: async () => {
      events.push(`core`)
      return core.promise
    },
    complete: async () => {
      events.push(`complete`)
      return complete.promise
    },
    fail: async () => { events.push(`unexpected fail`) }
  })
  harness.snapshots.replace(snapshot())
  harness.worker.start()
  await until(() => events.includes(`core`))

  const stopping = harness.worker.stop()
  assert.equal(await settles(stopping), false)
  core.resolve({ ok: true })
  await until(() => events.includes(`complete`))
  assert.equal(await settles(stopping), false)
  complete.resolve()
  await stopping

  assert.deepEqual(events, [`core`, `complete`])
})

test(`stop during completion waits and never converts ambiguity into failure`, async () => {
  const completion = deferred<void>()
  const events: string[] = []
  const harness = createHarness({
    listWork: async () => page([work()]),
    complete: async () => {
      events.push(`complete`)
      return completion.promise
    },
    fail: async () => { events.push(`unexpected fail`) }
  })
  harness.snapshots.replace(snapshot())
  harness.worker.start()
  await until(() => events.includes(`complete`))

  const stopping = harness.worker.stop()
  assert.equal(await settles(stopping), false)
  completion.reject(new Error(`response lost`))
  await stopping

  assert.deepEqual(events, [`complete`])
})

test(`a 401 work response can settle while stop waits, avoiding auth self-deadlock`, async () => {
  const response = deferred<WantedWorkPage>()
  const harness = createHarness({ listWork: async () => response.promise })
  harness.snapshots.replace(snapshot())
  harness.worker.start()

  const stopping = harness.worker.stop()
  assert.equal(await settles(stopping), false)
  response.reject(Object.assign(new Error(`Expired`), { status: 401 }))
  await stopping
})

test(`manual runs require an active authenticated runtime`, async () => {
  const harness = createHarness()
  await assert.rejects(harness.worker.runNow(), /not active/iu)
})

type Overrides = {
  listWork?: WantedWorkerDependencies[`client`][`listWork`]
  claim?: WantedWorkerDependencies[`client`][`claim`]
  recordAttempt?: WantedWorkerDependencies[`client`][`recordAttempt`]
  complete?: WantedWorkerDependencies[`client`][`complete`]
  fail?: WantedWorkerDependencies[`client`][`fail`]
  resolve?: WantedWorkerDependencies[`resolver`][`resolve`]
  execute?: WantedWorkerDependencies[`executor`][`execute`]
  guard?: WantedWorkerDependencies[`overlayActivity`][`getInactiveGameCommandResult`]
  eligibility?: () => Promise<GameCommandDecision>
  refreshNow?: WantedWorkerDependencies[`listPlayers`][`refreshNow`]
}

function createHarness(overrides: Overrides = {}) {
  const snapshots = new CurrentGameSnapshotStore()
  const sentinel = new FakeSentinel()
  const scheduler = new FakeScheduler()
  const calls = { claim: 0 }
  const client = {
    listWork: overrides.listWork ?? (async () => page()),
    claim: async (...input: Parameters<WantedWorkerDependencies[`client`][`claim`]>) => {
      calls.claim += 1
      return overrides.claim ? overrides.claim(...input) : claim()
    },
    recordAttempt: overrides.recordAttempt ?? (async (itemClaim, _work, automaticReason) => {
      await overrides.complete?.(itemClaim, automaticReason)
    }),
    complete: overrides.complete ?? (async () => undefined),
    fail: overrides.fail ?? (async () => undefined)
  }
  const dependencies: WantedWorkerDependencies = {
    client,
    resolver: { resolve: overrides.resolve ?? (() => messages()) },
    executor: { execute: overrides.execute ?? (async () => ({ ok: true })) },
    snapshots,
    listPlayers: {
      refreshNow: overrides.refreshNow ?? (async () => ({ ok: true, status: 200, statusText: `OK`, data: null }))
    },
    sentinel,
    eligibility: { check: overrides.eligibility ?? (async () => ({ kind: `interactive` })) },
    overlayActivity: { getInactiveGameCommandResult: overrides.guard ?? (() => null) },
    cadence: { wantedPollMs: 6_000, wantedSentinelPollMs: 3_000 },
    activity: { recheckMs: 150 },
    scheduler
  }
  return { worker: new WantedWorker(dependencies), snapshots, sentinel, scheduler, calls }
}

function snapshot(
  players: CurrentGameSnapshotInput[`players`] = [{
    index: 0,
    name: `Player`,
    playfabId: `PLAYER_1`,
    rawLine: `raw`
  }],
  name = `Duel`,
  gameServerId = 13
): CurrentGameSnapshotInput {
  return {
    observedAt: `2026-09-01T00:00:00.000Z`,
    gameServerId,
    externalId: `server-${gameServerId}`,
    serverName: name,
    serverAddress: `127.0.0.1:7777`,
    players,
    parseWarnings: []
  }
}

function player(name: string): CurrentGameSnapshotInput[`players`] {
  return [{ index: 0, name, playfabId: `PLAYER_1`, rawLine: `raw` }]
}

function work(overrides: Partial<WantedWork> = {}): WantedWork {
  return {
    wantedId: 7,
    sourceActionId: 41,
    targetServerId: 13,
    playfabId: `PLAYER_1`,
    actionType: `ban`,
    offenseType: `hacker`,
    duration: null,
    sourceReason: `Cheating`,
    creationType: `auto`,
    cycleRevision: 0,
    attemptNumber: 1,
    announce: true,
    ...overrides
  }
}

function claim(overrides: Partial<WantedClaim> = {}): WantedClaim {
  return {
    id: 9,
    wantedId: 7,
    sourceActionId: 41,
    gameServerId: 13,
    token: `123e4567-e89b-12d3-a456-426614174000`,
    ...overrides
  }
}

function page(work: readonly WantedWork[] = []): WantedWorkPage {
  return { work, messageContext: context }
}

function messages(id = 7): ResolvedWantedMessages {
  return {
    automaticReason: `[SB] reason ${id}`,
    banAnnouncement: `[SB] announcement ${id}`,
    mockAdminsay: `[SB] mock ${id}`
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

class FakeScheduler implements WantedScheduler {
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
  reject: (error: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((accept, deny) => {
    resolve = accept
    reject = deny
  })
  return { promise, resolve, reject }
}

async function until(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20 && !condition(); attempt += 1) await Promise.resolve()
  assert.equal(condition(), true)
}

async function settles(promise: Promise<unknown>): Promise<boolean> {
  let settled = false
  void promise.then(() => { settled = true }, () => { settled = true })
  await Promise.resolve()
  return settled
}
