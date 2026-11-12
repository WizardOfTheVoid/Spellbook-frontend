import assert from 'node:assert/strict'
import test from 'node:test'
import { TelemetryReadScheduler, TelemetrySnapshotCache } from './telemetryReadScheduler'

const flush = async () => { await new Promise(resolve => setImmediate(resolve)) }

test(`a seek cancels the old cohort and publishes only the latest pending cursor`, async () => {
  const reads: number[] = []
  const commits: number[] = []
  const cancelled: number[] = []
  const finish = new Map<number, (value: number) => void>()
  const scheduler = new TelemetryReadScheduler(
    async request => {
      reads.push(request.requestId)
      return await new Promise<number>(resolve => finish.set(request.requestId, resolve))
    },
    (_, value) => commits.push(value),
    error => { throw error },
    async request => { cancelled.push(request.requestId) }
  )
  scheduler.setActive(true)
  scheduler.enqueue({ workspaceId: `replay`, requestId: 1 })
  scheduler.enqueue({ workspaceId: `replay`, requestId: 2 }, true)
  scheduler.enqueue({ workspaceId: `replay`, requestId: 3 }, true)
  assert.deepEqual(reads, [1])
  finish.get(1)!(1)
  await flush()
  assert.deepEqual(reads, [1, 3])
  finish.get(3)!(3)
  await flush()
  assert.deepEqual(commits, [3])
  assert.deepEqual(cancelled, [1, 1])
})

test(`hidden work cancels, never publishes stale results, and starts no queued reads`, async () => {
  let complete!: (value: number) => void
  let reads = 0
  let commits = 0
  const scheduler = new TelemetryReadScheduler(
    async () => {
      reads++
      return await new Promise<number>(resolve => complete = resolve)
    },
    () => { commits++ }, error => { throw error }, async () => {}
  )
  scheduler.setActive(true)
  scheduler.enqueue({ workspaceId: `live`, requestId: 1 })
  scheduler.enqueue({ workspaceId: `live`, requestId: 2 })
  scheduler.setActive(false)
  complete(1)
  await flush()
  scheduler.enqueue({ workspaceId: `live`, requestId: 3 })
  assert.equal(reads, 1)
  assert.equal(commits, 0)
})

test(`snapshot cache evicts by least recent use and serialized byte limit`, () => {
  const cache = new TelemetrySnapshotCache<string>(2, 15)
  cache.set(`a`, `one`)
  cache.set(`b`, `two`)
  assert.equal(cache.get(`a`), `one`)
  cache.set(`c`, `tri`)
  assert.equal(cache.get(`b`), undefined)
  cache.set(`large`, `x`.repeat(20))
  assert.equal(cache.get(`large`), undefined)
  cache.set(`d`, `four`)
  assert.equal(cache.get(`a`), undefined)
  assert.equal(cache.get(`d`), `four`)
})
