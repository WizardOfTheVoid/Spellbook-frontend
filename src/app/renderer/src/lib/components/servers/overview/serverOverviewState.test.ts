import assert from 'node:assert/strict'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'
import type { GameServerOverview } from '@spellbook/shared/gameServerOverview'
import { createServerOverviewState, type ServerOverviewState } from './serverOverviewState'

const data = { gameServerId: 3, period: `day`, admins: { total: 2, items: [{ id: `user:1`, name: `One`, avatar: null }], offset: 0, hasMore: true } } as GameServerOverview

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

test(`overview ignores superseded servers, ranges, and inactive responses`, async () => {
  const requests: ReturnType<typeof deferred<GameServerOverview>>[] = []
  let latest: ServerOverviewState | undefined
  const controller = createServerOverviewState({ overview: async () => {
    const request = deferred<GameServerOverview>()
    requests.push(request)
    return request.promise
  }, admins: async () => data.admins }, state => { latest = state })
  controller.configure(3, `day`, true)
  controller.configure(4, `week`, true)
  requests[1].resolve({ ...data, gameServerId: 4, period: `week` })
  await setImmediate()
  requests[0].resolve(data)
  await setImmediate()
  assert.equal(latest?.data?.gameServerId, 4)
  controller.configure(4, `month`, true)
  controller.configure(4, `month`, false)
  requests[2].resolve(data)
  await setImmediate()
  assert.equal(latest?.data, null)
  await controller.refresh()
  assert.equal(requests.length, 3)
  controller.destroy()
})

test(`refresh coalesces requests, retains data on failure, and recovers`, async () => {
  let calls = 0
  let latest: ServerOverviewState | undefined
  const request = deferred<GameServerOverview>()
  const controller = createServerOverviewState({ overview: async () => {
    calls++
    if (calls === 1) return request.promise
    if (calls === 2) throw new Error(`offline`)
    return data
  }, admins: async () => data.admins }, state => { latest = state })
  controller.configure(3, `day`, true)
  await controller.refresh()
  assert.equal(calls, 1)
  request.resolve(data)
  await setImmediate()
  await controller.refresh()
  assert.equal(latest?.data, data)
  assert.equal(latest?.error, `offline`)
  await controller.refresh()
  assert.equal(latest?.error, null)
  controller.destroy()
})

test(`admin pagination advances past duplicate users and ignores responses after leaving the server`, async () => {
  let latest: ServerOverviewState | undefined
  const requests = [deferred<typeof data.admins>(), deferred<typeof data.admins>()]
  const offsets: number[] = []
  const controller = createServerOverviewState({ overview: async () => data, admins: async (_id, offset) => {
    offsets.push(offset)
    return requests[offsets.length - 1].promise
  } }, state => { latest = state })
  controller.configure(3, `day`, true)
  await setImmediate()
  const pending = controller.moreAdmins()
  requests[0].resolve({ ...data.admins, offset: 1, items: [...data.admins.items, { id: `user:2`, name: `Two`, avatar: null }] })
  await pending
  assert.deepEqual(offsets, [1])
  assert.deepEqual(latest?.data?.admins.items.map(admin => admin.id), [`user:1`, `user:2`])
  const abandoned = controller.moreAdmins()
  assert.deepEqual(offsets, [1, 3])
  controller.configure(4, `day`, false)
  requests[1].resolve({ ...data.admins, offset: 3, hasMore: false })
  await abandoned
  assert.equal(latest?.data, null)
  controller.destroy()
})
