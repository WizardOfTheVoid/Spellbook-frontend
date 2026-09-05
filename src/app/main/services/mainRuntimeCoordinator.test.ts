import assert from 'node:assert/strict'
import test from 'node:test'
import type { CurrentGameSnapshotStore } from './currentGameSnapshotStore'
import { MainRuntimeCoordinator, type RuntimeWorker } from './mainRuntimeCoordinator'

test(`runtime starts ListPlayers then Wanted only for an authenticated onboarded state`, async () => {
  const events: string[] = []
  const runtime = createRuntime(events)

  await runtime.transition({ authenticated: false, onboardingComplete: false })
  await runtime.transition({ authenticated: true, onboardingComplete: false })
  await runtime.transition({ authenticated: true, onboardingComplete: true })

  assert.deepEqual(events, [
    `clear`, `wanted:stop`, `list:stop`, `clear`,
    `clear`, `wanted:stop`, `list:stop`, `clear`,
    `list:start`, `wanted:start`
  ])
})

test(`identity end clears immediately, then stops Wanted before ListPlayers and clears again`, async () => {
  const wantedStop = deferred<void>()
  const events: string[] = []
  const runtime = new MainRuntimeCoordinator([
    { start: () => events.push(`list:start`), stop: async () => { events.push(`list:stop`) } },
    {
      start: () => events.push(`wanted:start`),
      stop: async () => {
        events.push(`wanted:stop`)
        await wantedStop.promise
      }
    }
  ], snapshots(events))

  const stopping = runtime.stop()
  assert.deepEqual(events, [`clear`])
  await Promise.resolve()
  assert.deepEqual(events, [`clear`, `wanted:stop`])

  wantedStop.resolve()
  await stopping
  assert.deepEqual(events, [`clear`, `wanted:stop`, `list:stop`, `clear`])
})

test(`a superseding sign-in starts only after unconditional final identity clear`, async () => {
  const wantedStop = deferred<void>()
  const events: string[] = []
  const runtime = new MainRuntimeCoordinator([
    { start: () => events.push(`list:start`), stop: async () => { events.push(`list:stop`) } },
    {
      start: () => events.push(`wanted:start`),
      stop: async () => {
        events.push(`wanted:stop`)
        await wantedStop.promise
      }
    }
  ], snapshots(events))

  const stopping = runtime.stop()
  await Promise.resolve()
  const starting = runtime.transition({ authenticated: true, onboardingComplete: true })
  wantedStop.resolve()
  await Promise.all([stopping, starting])

  assert.deepEqual(events, [
    `clear`,
    `wanted:stop`,
    `list:stop`,
    `clear`,
    `list:start`,
    `wanted:start`
  ])
})

test(`a stale eligible transition cannot restart a newer signed-out runtime`, async () => {
  const pending = deferred<void>()
  const events: string[] = []
  let wantedStops = 0
  const runtime = new MainRuntimeCoordinator([
    { start: () => events.push(`list:start`), stop: async () => { events.push(`list:stop`) } },
    {
      start: () => events.push(`wanted:start`),
      stop: async () => {
        wantedStops += 1
        events.push(`wanted:stop`)
        if (wantedStops === 1) await pending.promise
      }
    }
  ], snapshots(events))

  const firstStop = runtime.stop()
  const staleStart = runtime.transition({ authenticated: true, onboardingComplete: true })
  const latestStop = runtime.stop()
  pending.resolve()
  await Promise.all([firstStop, staleStart, latestStop])

  assert.equal(events.includes(`list:start`), false)
  assert.equal(events.includes(`wanted:start`), false)
  assert.equal(events.at(-1), `clear`)
})

test(`back-to-back identity ends never overlap sequential worker stops`, async () => {
  const pending = [deferred<void>(), deferred<void>()]
  let calls = 0
  let activeStops = 0
  let maximumActiveStops = 0
  const runtime = new MainRuntimeCoordinator([
    { start: () => undefined, stop: async () => undefined },
    {
      start: () => undefined,
      stop: async () => {
        const index = calls++
        activeStops += 1
        maximumActiveStops = Math.max(maximumActiveStops, activeStops)
        await pending[index]!.promise
        activeStops -= 1
      }
    }
  ], { clear: () => undefined })

  const first = runtime.stop()
  await Promise.resolve()
  const second = runtime.stop()
  await Promise.resolve()
  assert.equal(calls, 1)

  pending[0]!.resolve()
  await first
  await Promise.resolve()
  assert.equal(calls, 2)
  pending[1]!.resolve()
  await second

  assert.equal(maximumActiveStops, 1)
})

test(`a rejected Wanted stop still stops ListPlayers, clears, and permits later start`, async () => {
  const errors: unknown[] = []
  const events: string[] = []
  const runtime = new MainRuntimeCoordinator([
    { start: () => events.push(`list:start`), stop: async () => { events.push(`list:stop`) } },
    {
      start: () => events.push(`wanted:start`),
      stop: async () => {
        events.push(`wanted:stop`)
        throw new Error(`stop failed`)
      }
    }
  ], snapshots(events), error => errors.push(error))

  await runtime.stop()
  await runtime.transition({ authenticated: true, onboardingComplete: true })

  assert.deepEqual(events, [
    `clear`, `wanted:stop`, `list:stop`, `clear`, `list:start`, `wanted:start`
  ])
  assert.equal((errors[0] as Error).message, `stop failed`)
})

test(`terminal shutdown invalidates queued and future starts and is idempotent`, async () => {
  const firstStop = deferred<void>()
  const events: string[] = []
  let wantedStops = 0
  const runtime = new MainRuntimeCoordinator([
    { start: () => events.push(`list:start`), stop: async () => { events.push(`list:stop`) } },
    {
      start: () => events.push(`wanted:start`),
      stop: async () => {
        wantedStops += 1
        events.push(`wanted:stop`)
        if (wantedStops === 1) await firstStop.promise
      }
    }
  ], snapshots(events))

  const stopping = runtime.stop()
  await Promise.resolve()
  const queuedStart = runtime.transition({ authenticated: true, onboardingComplete: true })
  const shutdown = runtime.shutdown()
  const duplicateShutdown = runtime.shutdown()
  const futureStart = runtime.transition({ authenticated: true, onboardingComplete: true })
  firstStop.resolve()
  await Promise.all([stopping, queuedStart, shutdown, duplicateShutdown, futureStart])

  assert.equal(events.includes(`list:start`), false)
  assert.equal(events.includes(`wanted:start`), false)
  assert.equal(wantedStops, 2)
  assert.equal(events.at(-1), `clear`)
})

function createRuntime(events: string[]): MainRuntimeCoordinator {
  const workers: RuntimeWorker[] = [
    { start: () => events.push(`list:start`), stop: async () => { events.push(`list:stop`) } },
    { start: () => events.push(`wanted:start`), stop: async () => { events.push(`wanted:stop`) } }
  ]
  return new MainRuntimeCoordinator(workers, snapshots(events))
}

function snapshots(events: string[]): Pick<CurrentGameSnapshotStore, `clear`> {
  return { clear: () => events.push(`clear`) }
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
} {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(accept => { resolve = accept })
  return { promise, resolve }
}
