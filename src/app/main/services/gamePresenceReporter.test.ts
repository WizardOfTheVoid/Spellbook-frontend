import assert from 'node:assert/strict'
import test from 'node:test'
import { GamePresenceReporter } from './gamePresenceReporter'
import { CurrentGameSnapshotStore } from './currentGameSnapshotStore'
import { initialGameState } from '../../shared/gameState'
import { setImmediate } from 'node:timers/promises'

test(`dashboard presence keeps matched observations for five minutes without refreshing the action snapshot`, async () => {
  let now = 100000
  let state = { ...initialGameState, available: true, running: true, connected: true }
  const snapshots = new CurrentGameSnapshotStore()
  const reports: { sequence: number, gameServerId: number | null }[] = []
  const reporter = new GamePresenceReporter(snapshots, () => state, async input => { reports.push(input) }, () => now, `reporter`)
  reporter.update(7)
  await reporter.pulse()
  assert.equal(reports.at(-1)!.gameServerId, null)
  snapshots.replace({ observedAt: new Date(now).toISOString(), gameServerId: 3, externalId: `abc`, serverName: `duel`, serverAddress: `host`, players: [], parseWarnings: [] })
  await reporter.pulse()
  assert.equal(reports.at(-1)!.gameServerId, 3)
  state = { ...state, focused: true }
  await reporter.pulse()
  assert.equal(reports.at(-1)!.gameServerId, 3)
  now += 45000
  await reporter.pulse()
  assert.equal(reports.at(-1)!.gameServerId, 3)
  now += 254999
  await reporter.pulse()
  assert.equal(reports.at(-1)!.gameServerId, 3)
  assert.equal(snapshots.get()?.observedAt, new Date(100000).toISOString())
  now += 1
  await reporter.pulse()
  assert.equal(reports.at(-1)!.gameServerId, null)
  assert.ok(reports.at(-1)!.sequence > reports[0]!.sequence)
  reporter.update(null)
  reporter.destroy()
})

test(`dashboard presence clears immediately when game state or the matched server becomes unavailable`, async () => {
  let now = 100000
  let state = { ...initialGameState, available: true, running: true, connected: true }
  const snapshots = new CurrentGameSnapshotStore()
  const snapshot = { observedAt: new Date(now).toISOString(), gameServerId: 3, externalId: `abc`, serverName: `duel`, serverAddress: `host`, players: [], parseWarnings: [] }
  snapshots.replace(snapshot)
  const reports: { gameServerId: number | null }[] = []
  const reporter = new GamePresenceReporter(snapshots, () => state, async input => { reports.push(input) }, () => now, `clearing`)
  reporter.update(7)
  await reporter.pulse()
  now += 60000
  await reporter.pulse()
  assert.equal(reports.at(-1)?.gameServerId, 3)
  for (const unavailable of [{ connected: false }, { running: false }, { available: false }, { map: `Hastings`, playerCount: 1 }]) {
    state = { ...state, available: true, running: true, connected: true, map: null, playerCount: null, ...unavailable }
    await reporter.pulse()
    assert.equal(reports.at(-1)?.gameServerId, null)
  }
  state = { ...initialGameState, available: true, running: true, connected: true }
  snapshots.clear()
  await reporter.pulse()
  assert.equal(reports.at(-1)?.gameServerId, null)
  snapshots.replace({ ...snapshot, observedAt: new Date(now + 1).toISOString() })
  await reporter.pulse()
  assert.equal(reports.at(-1)?.gameServerId, null)
  reporter.destroy()
})

test(`presence changes are serialized and repeated observations wait for the heartbeat`, async () => {
  const snapshots = new CurrentGameSnapshotStore()
  let state = {...initialGameState,available:true,running:true,connected:false}
  const reports: {sequence:number,gameServerId:number|null}[] = []
  let active = 0
  let maximum = 0
  const reporter = new GamePresenceReporter(snapshots,() => state,async input => {
    active++
    maximum = Math.max(maximum,active)
    reports.push(input)
    await setImmediate()
    active--
  },() => 100000,`serialized`)
  reporter.update(7)
  await setImmediate()
  assert.equal(reports.at(-1)?.gameServerId,null)
  state = {...state,connected:true}
  const snapshot = {observedAt:new Date(100000).toISOString(),gameServerId:3,externalId:`abc`,serverName:`duel`,serverAddress:`host`,players:[],parseWarnings:[]}
  snapshots.replace(snapshot)
  snapshots.replace({...snapshot,gameServerId:4})
  for (let index=0; index<3; index++) await setImmediate()
  assert.equal(reports.at(-1)?.gameServerId,4)
  assert.equal(maximum,1)
  const count = reports.length
  reporter.observe()
  reporter.observe()
  await setImmediate()
  assert.equal(reports.length,count)
  await reporter.pulse()
  assert.equal(reports.length,count+1)
  reporter.update(null)
  await reporter.pulse()
  assert.equal(reports.length,count+1)
  reporter.destroy()
})
