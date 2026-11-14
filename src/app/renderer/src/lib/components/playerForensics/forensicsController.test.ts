import assert from 'node:assert/strict'
import test from 'node:test'
import type { CoreCallResult } from '../../core'
import { createForensicsController, initialForensicsState, type ForensicsState } from './forensicsController'
import { createNavigationHistory } from '../../navigation/navigationHistory'
import { normalizeForensicsTab } from './forensicsTabs'

const response = (playerId: number): CoreCallResult => ({ ok: true, status: 200, data: { ok: true, data: { playerId, status: `noData` } } } as CoreCallResult)
function fixture() {
  const calls: Array<{ tab: `ping` | `triangulate`, playerId: number } & ReturnType<typeof Promise.withResolvers<CoreCallResult>>> = []
  let state: ForensicsState
  const read = (tab: `ping` | `triangulate`) => async (playerId: number) => {
    const deferred = Promise.withResolvers<CoreCallResult>()
    calls.push({ ...deferred, tab, playerId })
    return await deferred.promise
  }
  const controller = createForensicsController({ ping: read(`ping`), triangulate: read(`triangulate`) }, next => { state = next })
  return { controller, calls, state: () => state }
}

test(`selection automatically reads the active tab once and caches each tab for the current player`, async () => {
  const f = fixture()
  f.controller.setSession(1, true)
  const first = f.controller.selectPlayer(10)
  const duplicate = f.controller.selectPlayer(10)
  assert.equal(f.calls.length, 1)
  f.calls[0]!.resolve(response(10))
  await Promise.all([first, duplicate])
  const map = f.controller.selectTab(`triangulate`)
  assert.deepEqual(f.calls.map(({ tab, playerId }) => ({ tab, playerId })), [{ tab: `ping`, playerId: 10 }, { tab: `triangulate`, playerId: 10 }])
  f.calls[1]!.resolve(response(10))
  await map
  await f.controller.selectTab(`ping`)
  await f.controller.selectTab(`triangulate`)
  assert.equal(f.calls.length, 2)
  assert.equal(f.state().ping.data?.playerId, 10)
  assert.equal(f.state().triangulate.data?.playerId, 10)
})

test(`tab switches preserve same-player pending results and ignore replaced targets`, async () => {
  const f = fixture()
  f.controller.setSession(1, true)
  const first = f.controller.selectPlayer(10)
  await f.controller.selectTab(`friends`)
  f.calls[0]!.resolve(response(10))
  await first
  assert.equal(f.state().activeTab, `friends`)
  assert.equal(f.state().ping.data?.playerId, 10)
  const obsolete = f.controller.selectTab(`triangulate`)
  const current = f.controller.selectPlayer(20)
  assert.equal(f.state().ping.data, null)
  f.calls[2]!.resolve(response(20))
  await current
  f.calls[1]!.resolve(response(10))
  await obsolete
  assert.equal(f.state().triangulate.data?.playerId, 20)
})

test(`selecting on placeholder tabs retains the target without analysis reads`, async () => {
  for (const tab of [`friends`, `rhythm`] as const) {
    const f = fixture()
    f.controller.setSession(1, true)
    await f.controller.selectTab(tab)
    await f.controller.selectPlayer(10)
    assert.equal(f.state().playerId, 10)
    assert.equal(f.calls.length, 0)
    const active = f.controller.selectTab(`ping`)
    f.calls[0]!.resolve(response(10))
    await active
    assert.equal(f.state().ping.data?.playerId, 10)
  }
})

test(`account changes, role loss, logout and disposal clear both datasets and invalidate pending reads`, async () => {
  for (const change of [`account`, `role`, `logout`, `dispose`] as const) {
    const f = fixture()
    f.controller.setSession(1, true)
    const pending = f.controller.selectPlayer(10)
    if (change === `account`) f.controller.setSession(2, true)
    if (change === `role`) f.controller.setSession(1, false)
    if (change === `logout`) f.controller.setSession(null, false)
    if (change === `dispose`) f.controller.dispose()
    f.calls[0]!.resolve(response(10))
    await pending
    assert.equal(f.state().playerId, null)
    assert.equal(f.state().ping.status, `idle`)
    assert.equal(f.state().triangulate.data, null)
  }
})

test(`authorization failure from either tab clears both and blocks reads until a new session`, async () => {
  for (const status of [401, 403]) for (const tab of [`ping`, `triangulate`] as const) {
    const f = fixture()
    await f.controller.selectPlayer(10)
    assert.equal(f.calls.length, 0)
    f.controller.setSession(1, true)
    const pending = f.controller.selectPlayer(10)
    if (tab === `triangulate`) {
      f.calls[0]!.resolve(response(10))
      await pending
    }
    const denied = tab === `triangulate` ? f.controller.selectTab(tab) : pending
    f.calls.at(-1)!.resolve({ ok: false, status, error: { message: `Access denied` } } as CoreCallResult)
    await denied
    const count = f.calls.length
    await f.controller.selectPlayer(20)
    await f.controller.selectTab(`ping`)
    f.controller.setSession(1, true)
    await f.controller.selectPlayer(20)
    assert.equal(f.calls.length, count)
    assert.equal(f.state().playerId, null)
    assert.equal(f.state().accessDenied, true)
    assert.equal(f.state().ping.data, null)
    assert.equal(f.state().triangulate.data, null)
    f.controller.setSession(2, true)
    assert.equal(f.state().accessDenied, false)
    await f.controller.selectTab(tab)
    const restored = f.controller.selectPlayer(20)
    assert.equal(f.calls.length, count + 1)
    f.calls.at(-1)!.resolve(response(20))
    await restored
    assert.equal(f.state()[tab].data?.playerId, 20)
  }
})

test(`ordinary sessions cannot start analyses from a selected or restored tab`, async () => {
  const f = fixture()
  f.controller.setSession(1, false)
  for (const tab of [`ping`, `triangulate`, `friends`, `rhythm`] as const) {
    await f.controller.selectTab(tab)
    await f.controller.selectPlayer(10)
  }
  assert.equal(f.calls.length, 0)
  assert.equal(f.state().playerId, null)
})

test(`retrying the active failed tab shares one request and clears its error`, async () => {
  const f = fixture()
  f.controller.setSession(1, true)
  await f.controller.selectTab(`triangulate`)
  const first = f.controller.selectPlayer(10)
  f.calls[0]!.reject(new Error(`Offline`))
  await first
  assert.equal(f.state().triangulate.status, `error`)
  const retry = f.controller.selectTab(`triangulate`)
  const duplicate = f.controller.selectTab(`triangulate`)
  assert.equal(f.calls.length, 2)
  f.calls[1]!.resolve(response(10))
  await Promise.all([retry, duplicate])
  assert.equal(f.state().triangulate.status, `ready`)
  assert.equal(f.state().triangulate.error, null)
})

test(`transient errors stay within their tab and retry on return, without rereading cached tabs`, async () => {
  const f = fixture()
  f.controller.setSession(1, true)
  const first = f.controller.selectPlayer(10)
  f.calls[0]!.resolve(response(10))
  await first
  const failed = f.controller.selectTab(`triangulate`)
  f.calls[1]!.reject(new Error(`Offline`))
  await failed
  assert.equal(f.state().ping.data?.playerId, 10)
  assert.equal(f.state().triangulate.status, `error`)
  await f.controller.selectTab(`ping`)
  const retry = f.controller.selectTab(`triangulate`)
  f.calls[2]!.resolve(response(10))
  await retry
  assert.equal(f.state().triangulate.status, `ready`)
  assert.equal(f.state().triangulate.error, null)
  assert.equal(f.calls.length, 3)
})

test(`invalid and mismatched identities never publish a profile`, async () => {
  const f = fixture()
  f.controller.setSession(1, true)
  for (const id of [0, -1, NaN, 1.5, Number.MAX_SAFE_INTEGER + 1]) await f.controller.selectPlayer(id)
  assert.equal(f.calls.length, 0)
  const pending = f.controller.selectPlayer(10)
  f.calls[0]!.resolve(response(20))
  await pending
  assert.equal(f.state().ping.status, `error`)
  assert.equal(f.state().ping.data, null)
  await f.controller.selectPlayer(null)
  assert.equal(f.state().playerId, null)
})

test(`a synchronous bridge failure can retry when returning to its tab`, async () => {
  let calls = 0
  const controller = createForensicsController({ ping: () => { calls++; throw new Error(`Bridge unavailable`) }, triangulate: async () => response(10) }, () => {})
  controller.setSession(1, true)
  await controller.selectPlayer(10)
  await controller.selectTab(`friends`)
  await controller.selectTab(`ping`)
  assert.equal(calls, 2)
})

test(`real navigation restoration normalizes legacy tabs before selecting a player`, async () => {
  for (const previous of [`altDetection`, `meta`, `unknown`]) {
    const history = createNavigationHistory()
    let legacy = previous
    const stop = history.register(`playerForensicsTab`, () => legacy, value => { legacy = value })
    await history.visit(() => { legacy = `friends` })
    stop()
    let state = initialForensicsState()
    const reads: number[] = []
    const controller = createForensicsController({ ping: async id => { reads.push(id); return response(id) }, triangulate: async id => response(id) }, next => { state = next })
    controller.setSession(1, true)
    history.register(`playerForensicsTab`, () => state.activeTab, value => controller.selectTab(value), normalizeForensicsTab)
    await history.back()
    assert.equal(state.activeTab, `ping`)
    await controller.selectPlayer(10)
    assert.deepEqual(reads, [10])
    assert.equal(state.ping.data?.playerId, 10)
  }
})
