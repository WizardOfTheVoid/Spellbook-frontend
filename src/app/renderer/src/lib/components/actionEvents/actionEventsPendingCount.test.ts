import assert from 'node:assert/strict'
import test from 'node:test'
import { get } from 'svelte/store'
import { createActionEventsPendingCount } from './actionEventsPendingCount'

test(`pending count loads once per account and coalesces simultaneous refreshes`, async () => {
  let calls = 0
  let count = 12
  const pending = createActionEventsPendingCount(async () => { calls++; return count })
  pending.syncUser(1)
  await pending.refresh()
  assert.equal(get(pending), 12)
  assert.equal(calls, 1)
  pending.syncUser(1)
  assert.equal(calls, 1)
  count = 0
  await pending.refresh()
  assert.equal(get(pending), 0)
})

test(`account and role changes discard old counts and stale responses`, async () => {
  const requests: Array<ReturnType<typeof Promise.withResolvers<number>>> = []
  const pending = createActionEventsPendingCount(() => {
    const request = Promise.withResolvers<number>()
    requests.push(request)
    return request.promise
  })
  pending.syncUser(1, true)
  pending.syncUser(1, false)
  requests[0].resolve(99)
  await Promise.resolve()
  assert.equal(get(pending), null)
  requests[1].resolve(3)
  await Promise.resolve()
  assert.equal(get(pending), 3)
  const refresh = pending.refresh()
  pending.syncUser(null)
  requests[2].resolve(9)
  await refresh
  assert.equal(get(pending), null)
})

test(`failed or invalid refreshes retain the previous count and can recover`, async () => {
  let count = 4
  let failed = false
  const pending = createActionEventsPendingCount(async () => {
    if (failed) throw new Error(`offline`)
    return count
  })
  pending.syncUser(1)
  await pending.refresh()
  failed = true
  await pending.refresh()
  assert.equal(get(pending), 4)
  failed = false
  count = NaN
  await pending.refresh()
  assert.equal(get(pending), 4)
  count = 2
  await pending.refresh()
  assert.equal(get(pending), 2)
})
