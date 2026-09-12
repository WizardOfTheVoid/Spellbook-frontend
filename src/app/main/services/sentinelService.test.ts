import assert from 'node:assert/strict'
import test from 'node:test'
import { SentinelService } from './sentinelService'

test('Sentinel starts disabled and enables only after Anti-AFK is disabled', async () => {
  const pending = deferred<{ enabled: boolean }>()
  const service = new SentinelService({ setEnabled: async () => pending.promise })
  const observed: boolean[] = []
  service.subscribe(state => observed.push(state.enabled))

  const enabling = service.setEnabled(true)

  assert.deepEqual(service.getState(), { enabled: false })
  assert.deepEqual(observed, [])
  pending.resolve({ enabled: false })

  assert.deepEqual(await enabling, { enabled: true })
  assert.deepEqual(service.getState(), { enabled: true })
  assert.deepEqual(observed, [true])
})

test('failed Anti-AFK disable leaves Sentinel false and silent', async () => {
  const service = new SentinelService({
    setEnabled: async () => { throw new Error(`Anti-AFK failed`) }
  })
  let notifications = 0
  service.subscribe(() => { notifications += 1 })

  await assert.rejects(service.setEnabled(true), /Anti-AFK failed/u)

  assert.deepEqual(service.getState(), { enabled: false })
  assert.equal(notifications, 0)
})

test('disabling Sentinel never enables Anti-AFK and idempotent updates stay silent', async () => {
  const antiAfkStates: boolean[] = []
  const observed: boolean[] = []
  const service = new SentinelService({
    setEnabled: async enabled => {
      antiAfkStates.push(enabled)
      return { enabled }
    }
  })
  service.subscribe(state => observed.push(state.enabled))

  await service.setEnabled(false)
  await service.setEnabled(true)
  await service.setEnabled(true)
  await service.setEnabled(false)
  await service.setEnabled(false)

  assert.deepEqual(antiAfkStates, [false])
  assert.deepEqual(observed, [true, false])
})

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(accept => { resolve = accept })
  return { promise, resolve }
}
