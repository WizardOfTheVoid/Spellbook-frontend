import assert from 'node:assert/strict'
import { test } from 'node:test'
import { get } from 'svelte/store'
import { TelemetryPreviewOrchestrator, selectEvents } from './preview/telemetryPreviewOrchestrator'

function recordingAt(timeMs: number) {
  const preview = new TelemetryPreviewOrchestrator()
  preview.openRecording(get(preview.view).recordings[0].id)
  preview.seek(timeMs)
  return preview
}

test(`preview starts idle and recording starts with all players in Overview`, () => {
  const preview = new TelemetryPreviewOrchestrator()
  assert.equal(preview.getSnapshot(), null)
  assert.equal(get(preview.view).recordings.length, 2)
  preview.selectPlayer(`p3`)
  preview.setTab(`kills`)
  preview.startRecording()
  assert.equal(preview.workspace().tab, `overview`)
  assert.equal(preview.workspace().selectedPlayerId, null)
  assert.equal(preview.getSnapshot()?.players.length, 8)
  assert.equal(get(preview.view).liveSession?.status, `recording`)
})

test(`paused and rewound live snapshots stay frozen as capture advances`, () => {
  const preview = new TelemetryPreviewOrchestrator()
  preview.startRecording()
  preview.advance(11_000)
  preview.pause()
  const paused = preview.getSnapshot()
  preview.advance(5_000)
  assert.deepEqual(preview.getSnapshot(), paused)
  assert.equal(get(preview.view).headMs, 16_000)
  preview.seek(6_000)
  const rewound = preview.getSnapshot()
  preview.advance(2_000)
  assert.deepEqual(preview.getSnapshot(), rewound)
  assert.equal(preview.workspace().mode, `paused`)
  preview.goLive()
  assert.equal(preview.getSnapshot()?.timeMs, 18_000)
  assert.equal(preview.workspace().mode, `live`)
})

test(`live and replay retain independent selection, tab, speed and cursors`, () => {
  const preview = new TelemetryPreviewOrchestrator()
  preview.startRecording()
  preview.advance(5_000)
  preview.selectPlayer(`p7`)
  preview.setTab(`items`)
  preview.setSpeed(2)
  preview.pause()
  const liveWorkspace = { ...preview.workspace() }
  preview.openRecording(get(preview.view).recordings[0].id)
  assert.equal(preview.workspace().selectedPlayerId, null)
  assert.equal(preview.workspace().tab, `overview`)
  preview.selectPlayer(`p2`)
  preview.setTab(`combat`)
  preview.setSpeed(0.5)
  preview.seek(3_000)
  preview.play()
  preview.advance(2_000)
  assert.equal(preview.workspace().cursorMs, 4_000)
  assert.equal(get(preview.view).headMs, 7_000)
  preview.setSource(`live`)
  assert.deepEqual(preview.workspace(), liveWorkspace)
  preview.setSource(`recordings`)
  assert.equal(preview.workspace().selectedPlayerId, `p2`)
  preview.closeRecording()
  assert.equal(preview.getSnapshot(), null)
  assert.equal(get(preview.view).liveSession?.status, `recording`)
})

test(`stopping preserves a saved session and a new recording starts fresh`, () => {
  const preview = new TelemetryPreviewOrchestrator()
  preview.startRecording()
  preview.advance(13_000)
  const sessionId = get(preview.view).liveSession!.id
  preview.stopRecording()
  assert.equal(get(preview.view).liveSession?.status, `saved`)
  assert.equal(get(preview.view).recordings.find(session => session.id === sessionId)?.durationMs, 13_000)
  preview.advance(9_000)
  assert.equal(get(preview.view).headMs, 13_000)
  preview.openRecording(sessionId)
  preview.seek(100_000)
  assert.equal(preview.workspace().cursorMs, 13_000)
  preview.startRecording()
  assert.notEqual(get(preview.view).liveSession!.id, sessionId)
  assert.equal(get(preview.view).headMs, 0)
  assert.equal(preview.workspace().mode, `live`)
  assert.equal(get(preview.view).recordings.length, 3)
})

test(`playback clamps to the session end and invalid inputs cannot corrupt time`, () => {
  const preview = recordingAt(2_000)
  preview.setSpeed(2)
  preview.play()
  preview.advance(1_000)
  assert.equal(preview.workspace().cursorMs, 4_000)
  preview.advance(Number.NaN)
  preview.advance(-1)
  assert.equal(preview.workspace().cursorMs, 4_000)
  preview.setSpeed(Number.NaN)
  assert.equal(preview.workspace().speed, 2)
  preview.advance(1_000_000)
  assert.equal(preview.workspace().cursorMs, get(preview.view).recordings[0].durationMs)
  assert.equal(preview.workspace().mode, `paused`)
  preview.seek(-20)
  assert.equal(preview.workspace().cursorMs, 0)
})

test(`live capture stops and saves at five minutes`, () => {
  const preview = new TelemetryPreviewOrchestrator()
  preview.startRecording()
  preview.advance(400_000)
  assert.equal(get(preview.view).headMs, 300_000)
  assert.equal(get(preview.view).liveSession?.status, `saved`)
  assert.equal(get(preview.view).recordings.length, 3)
})

test(`reconnecting catches elapsed capture time without moving a paused cursor`, () => {
  let now = 1_000
  const preview = new TelemetryPreviewOrchestrator(() => now)
  const disconnect = preview.connect()
  preview.startRecording()
  preview.pause()
  disconnect()
  now += 9_000
  const reconnect = preview.connect()
  try {
    assert.equal(get(preview.view).headMs, 9_000)
    assert.equal(preview.workspace().cursorMs, 0)
  } finally {
    reconnect()
  }
})

test(`late identity resolution preserves selection and rewinding hides future identity`, () => {
  const preview = recordingAt(7_000)
  preview.selectPlayer(`p7`)
  const anonymous = preview.getSnapshot()!.players.filter(player => !player.name)
  assert.equal(anonymous.length, 2)
  assert.equal(anonymous.find(player => player.id === `p7`)?.playFabId, null)
  preview.seek(8_000)
  assert.equal(preview.workspace().selectedPlayerId, `p7`)
  assert.ok(preview.getSnapshot()!.players.find(player => player.id === `p7`)?.name)
  assert.ok(preview.getSnapshot()!.players.find(player => player.id === `p7`)?.playFabId)
  preview.seek(7_000)
  assert.equal(preview.getSnapshot()!.players.find(player => player.id === `p7`)?.name, null)
})

test(`death and respawn preserve lifetimes without connecting paths or metric gaps`, () => {
  const preview = recordingAt(20_000)
  const snapshot = preview.getSnapshot()!
  const player = snapshot.players.find(player => player.id === `p3`)!
  assert.equal(player.deathCount, 1)
  assert.equal(player.damageTaken, 125)
  assert.equal(player.health, player.maxHealth)
  assert.equal(new Set(player.healthHistory.map(sample => sample.lifetimeId)).size, 2)
  assert.ok(player.healthHistory.some(sample => sample.timeMs > 12_000 && sample.timeMs < 18_000 && sample.value === null))
  const paths = snapshot.paths.filter(path => path.playerId === `p3`)
  assert.equal(paths.length, 2)
  assert.notEqual(paths[0].lifetimeId, paths[1].lifetimeId)
  assert.ok(paths[0].points.every(point => point.timeMs < 12_000))
  assert.ok(paths[1].points.every(point => point.timeMs >= 18_000))
})

test(`missing values and disconnected players never fabricate continuing samples`, () => {
  const preview = recordingAt(15_000)
  const missing = preview.getSnapshot()!.players.find(player => player.id === `p4`)!
  assert.equal(missing.health, null)
  assert.ok(missing.healthHistory.some(sample => sample.value === null))
  preview.seek(25_000)
  const snapshot = preview.getSnapshot()!
  const disconnected = snapshot.players.find(player => player.id === `p6`)!
  assert.equal(disconnected.present, false)
  assert.equal(disconnected.lastSeenMs, 23_000)
  assert.equal(disconnected.position, null)
  assert.equal(disconnected.health, null)
  const paths = snapshot.paths.filter(path => path.playerId === `p2`)
  assert.equal(paths.length, 2)
  assert.ok(paths[0].points.every(point => point.timeMs < 14_000))
  assert.ok(paths[1].points.every(point => point.timeMs >= 18_000))
})

test(`item aggregation grows only from observed events and separates class and relationship`, () => {
  const preview = recordingAt(20_000)
  const burst = () => selectEvents(preview.getSnapshot()!, `p1`, `items`)
    .find(event => event.kind === `itemObserved` && event.itemClass === `BP_Arrow_C` && event.relationship === `owner`)!
  assert.equal(burst().count, 1)
  const id = burst().id
  preview.seek(20_490)
  assert.equal(burst().count, 50)
  assert.equal(burst().id, id)
  preview.seek(20_990)
  assert.equal(burst().count, 100)
  const events = selectEvents(preview.getSnapshot()!, `p1`, `items`)
  assert.equal(events.filter(event => event.kind === `itemObserved` && event.itemClass === `BP_Arrow_C`).length, 2)
  assert.ok(events.some(event => event.itemClass === `BP_ThrowingAxe_C` && event.count === 1))
  preview.seek(19_999)
  assert.equal(burst(), undefined)
})

test(`selected kills include victims and all contributors without claiming a single killer`, () => {
  const snapshot = recordingAt(13_000).getSnapshot()!
  for (const id of [`p1`, `p2`, `p3`]) {
    const deaths = selectEvents(snapshot, id, `kills`)
    assert.equal(deaths.length, 1)
    assert.equal(deaths[0].actorId, null)
    assert.deepEqual(deaths[0].contributorIds, [`p1`, `p2`])
  }
  assert.equal(selectEvents(snapshot, `p4`, `kills`).length, 0)
})

test(`snapshot statistics and events contain no information beyond the cursor`, () => {
  const preview = recordingAt(13_000)
  assert.equal(preview.getSnapshot()!.players.find(player => player.id === `p1`)?.damageDealt, 85)
  preview.seek(5_000)
  const snapshot = preview.getSnapshot()!
  assert.equal(snapshot.players.find(player => player.id === `p1`)?.damageDealt, 0)
  assert.equal(snapshot.players.find(player => player.id === `p3`)?.deathCount, 0)
  assert.ok(snapshot.events.every(event => event.timeMs <= 5_000))
  assert.ok(snapshot.players.every(player => player.healthHistory.every(sample => sample.timeMs <= 5_000)))
  assert.ok(snapshot.paths.every(path => path.points.every(point => point.timeMs <= 5_000)))
})

test(`death and disconnect events are distinct from combat interactions`, () => {
  const snapshot = recordingAt(25_000).getSnapshot()!
  assert.deepEqual(selectEvents(snapshot, null, `kills`).map(event => event.kind), [`death`, `disconnect`])
  const combat = selectEvents(snapshot, null, `combat`)
  assert.ok(combat.some(event => event.kind === `damage`))
  assert.ok(combat.some(event => event.kind === `heal`))
  assert.ok(combat.every(event => event.kind !== `death` && event.kind !== `disconnect`))
})

test(`inventory membership reflects the cursor and restores previous membership when rewound`, () => {
  const preview = recordingAt(25_000)
  const membership = (id: string, slot: number) => preview.getSnapshot()!.players.find(player => player.id === id)!.inventory[slot].item
  assert.equal(membership(`p1`, 0), `BP_LongSword_C`)
  assert.equal(membership(`p2`, 2), null)
  preview.seek(26_000)
  assert.equal(membership(`p1`, 0), `BP_PoleAxe_C`)
  preview.seek(20_000)
  assert.equal(membership(`p1`, 0), `BP_LongSword_C`)
  assert.equal(membership(`p2`, 2), `BP_ThrowingAxe_C`)
})

test(`current player values use the latest recorded sample rather than interpolating missing observations`, () => {
  const preview = recordingAt(7_490)
  const player = preview.getSnapshot()!.players[0]
  assert.equal(player.stamina, player.staminaHistory.at(-1)!.value)
  assert.equal(player.lastSeenMs, 7_000)
  assert.deepEqual(player.position, preview.getSnapshot()!.paths.find(path => path.playerId === player.id)!.points.at(-1)!.position)
})

test(`idle and paused saved sessions do not publish unchanged clock ticks`, () => {
  const preview = new TelemetryPreviewOrchestrator()
  let emissions = 0
  const unsubscribe = preview.view.subscribe(() => emissions++)
  preview.advance(100)
  assert.equal(emissions, 1)
  preview.startRecording()
  preview.advance(1_000)
  preview.stopRecording()
  preview.openRecording(get(preview.view).recordings[0].id)
  const before = emissions
  preview.advance(100)
  assert.equal(emissions, before)
  preview.play()
  const playing = emissions
  preview.advance(100)
  assert.equal(emissions, playing + 1)
  unsubscribe()
})

test(`reconnecting applies hidden capture time once and overlapping connections preserve the paused cursor`, () => {
  let now = 1_000
  const preview = new TelemetryPreviewOrchestrator(() => now)
  const disconnect = preview.connect()
  preview.startRecording()
  preview.pause()
  now = 1_500
  disconnect()
  disconnect()
  assert.equal(get(preview.view).headMs, 500)
  now = 2_500
  const firstConnection = preview.connect()
  const secondConnection = preview.connect()
  assert.equal(get(preview.view).headMs, 1_500)
  now = 3_000
  firstConnection()
  now = 3_500
  secondConnection()
  assert.equal(get(preview.view).headMs, 2_500)
  now = 4_500
  const lastConnection = preview.connect()
  try {
    assert.equal(get(preview.view).headMs, 3_500)
    assert.equal(preview.workspace().cursorMs, 0)
    assert.equal(preview.workspace().mode, `paused`)
  } finally {
    lastConnection()
  }
})
