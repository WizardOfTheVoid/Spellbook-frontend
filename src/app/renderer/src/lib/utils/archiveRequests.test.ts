import assert from 'node:assert/strict'
import test from 'node:test'
import { createLatestRequestTracker, createQueryDebouncer } from './archiveRequests.js'

test(`debounces rapid archive changes into one final value`, async () => {
  const applied: string[] = []
  const debouncer = createQueryDebouncer<string>(value => applied.push(value), 10)
  debouncer.schedule(`first`)
  debouncer.schedule(`last`)
  await new Promise(resolve => setTimeout(resolve, 30))
  assert.deepEqual(applied, [`last`])
})

test(`cancels a pending archive query`, async () => {
  const applied: string[] = []
  const debouncer = createQueryDebouncer<string>(value => applied.push(value), 10)
  debouncer.schedule(`value`)
  debouncer.cancel()
  await new Promise(resolve => setTimeout(resolve, 30))
  assert.deepEqual(applied, [])
})

test(`settles only the latest archive request`, () => {
  const pending: boolean[] = []
  const tracker = createLatestRequestTracker(value => pending.push(value))
  const first = tracker.start()
  const second = tracker.start()
  tracker.settle(first)
  assert.equal(tracker.isCurrent(first), false)
  assert.equal(tracker.isCurrent(second), true)
  tracker.settle(second)
  assert.deepEqual(pending, [true, false])
})

