import assert from 'node:assert/strict'
import test from 'node:test'
import { get } from 'svelte/store'
import { ApiResultError } from '$lib/utils/apiResult'
import { createWantedPendingCount } from './wantedPendingCount'

test(`pending candidates use the queue total, including zero, and coalesce refreshes`, async () => {
  let calls = 0
  let total = 137
  const pending = createWantedPendingCount(async () => { calls++
    return { meta: { totalResults: total } } })
  pending.syncUser(1, true)
  await pending.refresh()
  assert.equal(get(pending), 137)
  assert.equal(calls, 1)
  pending.syncUser(1, true)
  assert.equal(calls, 1)
  total = 0
  await pending.refresh()
  assert.equal(get(pending), 0)
})

test(`review permission changes and logout clear counts and ignore stale requests`, async () => {
  const requests: Array<ReturnType<typeof Promise.withResolvers<{ meta: { totalResults: number } }>>> = []
  const pending = createWantedPendingCount(() => {
    const request = Promise.withResolvers<{ meta: { totalResults: number } }>()
    requests.push(request)
    return request.promise
  })
  pending.syncUser(1, false)
  await pending.refresh()
  assert.equal(requests.length, 0)
  pending.syncUser(1, true)
  pending.syncUser(2, true)
  requests[0].resolve({ meta: { totalResults: 99 } })
  await Promise.resolve()
  assert.equal(get(pending), null)
  requests[1].resolve({ meta: { totalResults: 3 } })
  await Promise.resolve()
  assert.equal(get(pending), 3)
  pending.syncUser(2, false)
  assert.equal(get(pending), null)
  pending.syncUser(2, true)
  pending.syncUser(null)
  requests[2].resolve({ meta: { totalResults: 9 } })
  await Promise.resolve()
  assert.equal(get(pending), null)
})

test(`failed or invalid totals retain the last count and recover`, async () => {
  let total: number | null = 4
  let failed = false
  const pending = createWantedPendingCount(async () => {
    if (failed) throw new Error(`offline`)
    return { meta: { totalResults: total } }
  })
  pending.syncUser(1, true)
  await pending.refresh()
  failed = true
  await pending.refresh()
  assert.equal(get(pending), 4)
  failed = false
  for (total of [null, NaN, Infinity, -1, 1.5]) {
    await pending.refresh()
    assert.equal(get(pending), 4)
  }
  total = 2
  await pending.refresh()
  assert.equal(get(pending), 2)
})

test(`review invalidation discards an older poll and fetches the updated queue`, async () => {
  const requests: Array<ReturnType<typeof Promise.withResolvers<{ meta: { totalResults: number } }>>> = []
  const pending = createWantedPendingCount(() => {
    const request = Promise.withResolvers<{ meta: { totalResults: number } }>()
    requests.push(request)
    return request.promise
  })
  pending.syncUser(1, true)
  pending.invalidate()
  requests[1].resolve({ meta: { totalResults: 0 } })
  await Promise.resolve()
  assert.equal(get(pending), 0)
  requests[0].resolve({ meta: { totalResults: 8 } })
  await Promise.resolve()
  assert.equal(get(pending), 0)
})

test(`a server-side access revocation clears the last count without a session change`, async () => {
  let status = 200
  const pending = createWantedPendingCount(async () => {
    if (status !== 200) throw new ApiResultError(`Access denied`, status)
    return { meta: { totalResults: 7 } }
  })
  pending.syncUser(1, true)
  await pending.refresh()
  assert.equal(get(pending), 7)
  for (const denied of [403, 401]) {
    status = denied
    await pending.refresh()
    assert.equal(get(pending), null)
    status = 200
    await pending.refresh()
    assert.equal(get(pending), 7)
  }
})
