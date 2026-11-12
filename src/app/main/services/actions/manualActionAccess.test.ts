import assert from 'node:assert/strict'
import test from 'node:test'
import type { HttpClient } from '../../api/http-client'
import { CurrentGameSnapshotStore } from '../currentGameSnapshotStore'
import { ManualActionAccess } from './manualActionAccess'

function fixture() {
  const snapshots = new CurrentGameSnapshotStore()
  const input = { gameServerId: 7, externalId: `lobby-7`, observedAt: new Date().toISOString(), serverName: `Arena`, serverAddress: null, players: [], parseWarnings: [] }
  snapshots.replace(input)
  const state = { connected: true, epoch: 1, allowed: true as boolean | undefined, reason: null as string | null, failure: false,
    responseServerId: 7, responseExternalId: `lobby-7`, duringLookup: () => {} }
  let lookups = 0
  const access = new ManualActionAccess({
    get authenticatedEpoch() { return state.epoch },
    getServer: async (path, query) => {
      assert.equal(path, `/server-profiles/active`)
      assert.deepEqual(query, { externalId: `lobby-7` })
      lookups++
      state.duringLookup()
      if (state.failure) throw new Error(`Offline`)
      return { ok: true, status: 200, statusText: `OK`, data: { ok: true, data: { canExecuteActions: state.allowed, actionExecutionReason: state.reason,
        gameServer: { id: state.responseServerId, externalId: state.responseExternalId } } } }
    }
  } as Pick<HttpClient, `getServer` | `authenticatedEpoch`>, snapshots, { isInGameServer: () => state.connected })
  return { access, snapshots, state, input, lookups: () => lookups }
}

test(`an explicit allowed response for the current server permits manual actions`, async () => {
  const { access } = fixture()
  assert.equal(await access.check(7), null)
})

test(`player actions require the target in the current server roster`, async () => {
  const { access, snapshots, input, lookups } = fixture()
  assert.equal((await access.check(7, `PLAYER`))?.ok, false)
  assert.equal(lookups(), 0)
  snapshots.replace({ ...input, players: [{ index: 0, name: `Player`, playfabId: `PLAYER`, rawLine: `` }] })
  assert.equal(await access.check(7, `PLAYER`), null)
  assert.equal((await access.check(7, `OTHER`))?.ok, false)
})

test(`a player leaving during the access lookup invalidates the action`, async () => {
  const { access, snapshots, state, input } = fixture()
  snapshots.replace({ ...input, players: [{ index: 0, name: `Player`, playfabId: `PLAYER`, rawLine: `` }] })
  state.duringLookup = () => { snapshots.replace(input) }
  assert.equal((await access.check(7, `PLAYER`))?.ok, false)
})

for (const allowed of [false, undefined]) {
  test(`manual actions fail closed for eligibility ${allowed}`, async () => {
    const { access, state } = fixture()
    state.allowed = allowed
    state.reason = `Server supplied reason`
    const denied = await access.check()
    assert.equal(denied?.ok, false)
    assert.equal(denied?.error?.message, `Server supplied reason`)
  })
}

test(`an access lookup failure denies manual actions`, async () => {
  const { access, state } = fixture()
  state.failure = true
  assert.equal((await access.check())?.ok, false)
})

for (const change of [`session`, `server`, `connection`, `invalidation`, `responseServer`, `responseLobby`] as const) {
  test(`a ${change} change during eligibility lookup denies the old approval`, async () => {
    const { access, snapshots, state, input } = fixture()
    state.duringLookup = () => {
      if (change === `session`) state.epoch++
      if (change === `server`) snapshots.replace({ ...input, gameServerId: 8 })
      if (change === `connection`) state.connected = false
      if (change === `invalidation`) {
        snapshots.clear()
        snapshots.replace(input)
      }
      if (change === `responseServer`) state.responseServerId = 8
      if (change === `responseLobby`) state.responseExternalId = `lobby-8`
    }
    assert.equal((await access.check())?.ok, false)
  })
}

test(`unresolved, stale and mismatched target servers never request eligibility`, async () => {
  const { access, snapshots, input, lookups } = fixture()
  assert.equal((await access.check(8))?.ok, false)
  snapshots.replace({ ...input, observedAt: new Date(Date.now() - 60_000).toISOString() })
  assert.equal((await access.check())?.ok, false)
  snapshots.clear()
  assert.equal((await access.check())?.ok, false)
  assert.equal(lookups(), 0)
})

for (const age of [15_000, 25_000, 59_999, 60_000, 60_001]) {
  test(`manual action freshness at ${age} milliseconds`, async context => {
    context.mock.timers.enable({ apis: [`Date`], now: Date.parse(`2026-10-25T06:00:00Z`) })
    const { access, snapshots, input, lookups } = fixture()
    snapshots.replace({ ...input, observedAt: new Date(Date.now() - age).toISOString() })
    const result = await access.check(7)
    if (age < 60_000) assert.equal(result, null)
    else assert.equal(result?.ok, false)
    assert.equal(lookups(), age < 60_000 ? 1 : 0)
  })
}

test(`a roster expiring during the access lookup cannot authorize an action`, async context => {
  context.mock.timers.enable({ apis: [`Date`], now: Date.parse(`2026-10-25T06:00:00Z`) })
  const { access, snapshots, input, state, lookups } = fixture()
  snapshots.replace({ ...input, observedAt: new Date(Date.now() - 59_999).toISOString() })
  state.duringLookup = () => context.mock.timers.tick(1)
  assert.equal((await access.check(7))?.ok, false)
  assert.equal(lookups(), 1)
})
