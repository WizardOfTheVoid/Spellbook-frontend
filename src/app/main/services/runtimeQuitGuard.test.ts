import assert from 'node:assert/strict'
import test from 'node:test'
import { RuntimeQuitGuard, withShutdownTimeout } from './runtimeQuitGuard'

test(`quit waits for runtime shutdown and permits only the final Electron quit`, async () => {
  const stopping = deferred<void>()
  const events: string[] = []
  const guard = new RuntimeQuitGuard(
    async () => {
      events.push(`stop`)
      await stopping.promise
    },
    () => events.push(`cleanup`),
    () => events.push(`quit`),
  )
  const first = { preventDefault: () => events.push(`prevent:first`) }
  const repeated = { preventDefault: () => events.push(`prevent:repeated`) }

  guard.handle(first)
  guard.handle(repeated)
  assert.deepEqual(events, [`prevent:first`, `stop`, `prevent:repeated`])

  stopping.resolve()
  await stopping.promise
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(events, [`prevent:first`, `stop`, `prevent:repeated`, `cleanup`, `quit`])

  guard.handle({ preventDefault: () => events.push(`prevent:final`) })
  assert.equal(events.includes(`prevent:final`), false)
})

test(`quit reports shutdown failure but still cleans up and exits`, async () => {
  const events: string[] = []
  const errors: unknown[] = []
  const guard = new RuntimeQuitGuard(
    async () => {
      throw new Error(`shutdown failed`)
    },
    () => events.push(`cleanup`),
    () => events.push(`quit`),
    (error) => errors.push(error),
  )

  guard.handle({ preventDefault: () => events.push(`prevent`) })
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(events, [`prevent`, `cleanup`, `quit`])
  assert.equal((errors[0] as Error).message, `shutdown failed`)
})

test(`quit can stop runtime work before its owned Core process`, async () => {
  const events: string[] = []
  const guard = new RuntimeQuitGuard(
    async () => {
      events.push(`runtime:stop`)
      await Promise.resolve()
      events.push(`core:stop`)
    },
    () => events.push(`cleanup`),
    () => events.push(`quit`),
  )

  guard.handle({ preventDefault: () => events.push(`prevent`) })
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(events, [`prevent`, `runtime:stop`, `core:stop`, `cleanup`, `quit`])
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

test(`explicit preparation shares shutdown, cleans up once and does not request quit`, async () => {
  const events: string[] = []
  const guard = new RuntimeQuitGuard(
    async () => {
      events.push(`stop`)
    },
    () => {
      events.push(`cleanup`)
    },
    () => {
      events.push(`quit`)
    },
  )
  await Promise.all([guard.prepareToQuit(), guard.prepareToQuit()])
  assert.deepEqual(events, [`stop`, `cleanup`])
  guard.handle({ preventDefault: () => events.push(`prevent`) })
  assert.deepEqual(events, [`stop`, `cleanup`])
})

test(`explicit preparation propagates shutdown and cleanup failures`, async () => {
  for (const stopFails of [true, false]) {
    const guard = new RuntimeQuitGuard(
      async () => {
        if (stopFails) throw new Error(`stop failed`)
      },
      () => {
        if (!stopFails) throw new Error(`cleanup failed`)
      },
      () => assert.fail(`unexpected quit`),
    )
    await assert.rejects(() => guard.prepareToQuit(), /failed/u)
  }
})

test(`ordinary Quit supersedes pending explicit preparation`, async () => {
  const stopping = deferred<void>()
  let quits = 0
  const guard = new RuntimeQuitGuard(
    async () => stopping.promise,
    () => undefined,
    () => {
      quits += 1
    },
  )
  const preparation = guard.prepareToQuit()
  const rejected = assert.rejects(preparation, /quit/u)
  guard.handle({ preventDefault: () => undefined })
  stopping.resolve()
  await rejected
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(quits, 1)
})

test(`a stuck preparation times out, cannot succeed late, and still permits ordinary Quit`, async (t) => {
  t.mock.timers.enable({ apis: [`setTimeout`] })
  const stopping = deferred<void>()
  let quits = 0
  let cleanups = 0
  const guard = new RuntimeQuitGuard(
    async () => stopping.promise,
    () => {
      cleanups += 1
    },
    () => {
      quits += 1
    },
    () => undefined,
  )
  const preparation = assert.rejects(() => guard.prepareToQuit(), /timed out/u)
  t.mock.timers.tick(30_000)
  await preparation
  guard.handle({ preventDefault: () => undefined })
  await new Promise((resolve) => setImmediate(resolve))
  stopping.resolve()
  assert.equal(quits, 1)
  assert.equal(cleanups, 1)
  await assert.rejects(() => guard.prepareToQuit())
})

test(`bounded pre-stop work still reaches final process cleanup`, async (t) => {
  t.mock.timers.enable({ apis: [`setTimeout`] })
  const stopping = deferred<void>()
  let processStops = 0
  const guard = new RuntimeQuitGuard(
    async () => {
      try {
        await withShutdownTimeout(stopping.promise, 20_000)
      } finally {
        processStops += 1
      }
    },
    () => undefined,
    () => undefined,
  )
  const rejected = assert.rejects(() => guard.prepareToQuit(), /timed out/u)
  t.mock.timers.tick(20_000)
  await rejected
  assert.equal(processStops, 1)
  stopping.resolve()
  await assert.rejects(() => guard.prepareToQuit(), /timed out/u)
})
