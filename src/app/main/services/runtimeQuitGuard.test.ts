import assert from 'node:assert/strict'
import test from 'node:test'
import { RuntimeQuitGuard } from './runtimeQuitGuard'

test(`quit waits for runtime shutdown and permits only the final Electron quit`, async () => {
  const stopping = deferred<void>()
  const events: string[] = []
  const guard = new RuntimeQuitGuard(
    async () => { events.push(`stop`); await stopping.promise },
    () => events.push(`cleanup`),
    () => events.push(`quit`)
  )
  const first = { preventDefault: () => events.push(`prevent:first`) }
  const repeated = { preventDefault: () => events.push(`prevent:repeated`) }

  guard.handle(first)
  guard.handle(repeated)
  assert.deepEqual(events, [`prevent:first`, `stop`, `prevent:repeated`])

  stopping.resolve()
  await stopping.promise
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(events, [`prevent:first`, `stop`, `prevent:repeated`, `cleanup`, `quit`])

  guard.handle({ preventDefault: () => events.push(`prevent:final`) })
  assert.equal(events.includes(`prevent:final`), false)
})

test(`quit reports shutdown failure but still cleans up and exits`, async () => {
  const events: string[] = []
  const errors: unknown[] = []
  const guard = new RuntimeQuitGuard(
    async () => { throw new Error(`shutdown failed`) },
    () => events.push(`cleanup`),
    () => events.push(`quit`),
    error => errors.push(error)
  )

  guard.handle({ preventDefault: () => events.push(`prevent`) })
  await new Promise(resolve => setImmediate(resolve))

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
    () => events.push(`quit`)
  )

  guard.handle({ preventDefault: () => events.push(`prevent`) })
  await new Promise(resolve => setImmediate(resolve))

  assert.deepEqual(events, [`prevent`, `runtime:stop`, `core:stop`, `cleanup`, `quit`])
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(next => { resolve = next })
  return { promise, resolve }
}
