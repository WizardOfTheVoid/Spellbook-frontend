import assert from 'node:assert/strict'
import test from 'node:test'
import { get } from 'svelte/store'
import type { RecordingStatus, TelemetryApi, TelemetryUpdate } from '../../../../../../../shared/telemetry/telemetryTypes'
import { TelemetrySessionOrchestrator } from './telemetrySessionOrchestrator'

const flush = async () => { await new Promise(resolve => setImmediate(resolve)) }
const saved: RecordingStatus = {
  id: `recording`, endpoint: { host: `127.0.0.1`, port: 7777 }, state: `saved`, requestedAtUtc: `2026-10-20T10:00:00Z`,
  head: { sequence: 5, elapsedUs: 10_000_000 }, revision: 1, generation: `generation`, sizeBytes: 100, packetCount: 3, lossCount: 0, decoderVersion: `test`
}

function fixture(active: RecordingStatus | null = null, frameError: string | null = null) {
  const calls: { method: string, input?: unknown }[] = []
  let update: ((value: TelemetryUpdate) => void) | null = null
  let now = 0
  const api = {
    getStatus: async () => {
      calls.push({ method: `getStatus` })
      return { capture: { available: false }, active }
    },
    listRecordings: async () => {
      calls.push({ method: `listRecordings` })
      return [saved]
    },
    getFrame: async (input: { atUs: number }) => {
      calls.push({ method: `getFrame`, input })
      if (frameError) throw new Error(frameError)
      return { recordingId: saved.id, revision: 1, atUs: input.atUs, committedHead: saved.head,
        cursor: { generation: `generation`, updateSequence: 1 },
        entities: [{ entityId: `pawn`, actorGuid: 2, channel: 1, kind: `pawn`, active: true }], players: [], coverage: {},
        readView: { generation: `generation`, throughSequence: 5, atUs: input.atUs } }
    },
    getTrajectories: async (input: { toUs: number }) => {
      calls.push({ method: `getTrajectories`, input })
      return { paths: [], readView: { generation: `generation`, throughSequence: 5, atUs: input.toUs } }
    },
    getEvents: async (input: { toUs: number, offset?: number }) => {
      calls.push({ method: `getEvents`, input })
      return { events: [], nextSequence: input.offset ? null : 7, nextOffset: input.offset ? null : 7,
        matchingGroups: 14, readView: { generation: `generation`, throughSequence: 5, atUs: input.toUs } }
    },
    cancelReads: async (input: unknown) => { calls.push({ method: `cancelReads`, input }) },
    subscribeUpdates: (_: unknown, listener: (value: TelemetryUpdate) => void) => {
      update = listener
      return () => { update = null }
    },
    stopRecording: async () => {
      calls.push({ method: `stopRecording` })
      return saved
    },
    startRecording: async (input: { endpoint: RecordingStatus[`endpoint`] }) => {
      calls.push({ method: `startRecording`, input })
      return { ...saved, endpoint: input.endpoint, state: `recording` }
    }
  } as unknown as TelemetryApi
  return { model: new TelemetrySessionOrchestrator(() => api, () => now), calls,
    advance: (value: number) => { now += value },
    update: (value: TelemetryUpdate) => update?.(value) }
}

test(`paused saved sessions issue one completed read and hiding never stops capture`, async () => {
  const { model, calls } = fixture()
  const disconnect = model.connect()
  await flush()
  model.openRecording(saved.id)
  await flush()
  assert.equal(calls.filter(call => call.method === `getFrame`).length, 1)
  assert.equal(model.workspace().cursorMs, 0)
  disconnect()
  model.seek(5000, true)
  await flush()
  assert.equal(calls.filter(call => call.method === `getFrame`).length, 1)
  assert.equal(calls.some(call => call.method === `stopRecording`), false)
})

test(`showing reconciles once and preserves independent live and replay cursors`, async () => {
  const { model, calls } = fixture({ ...saved, state: `recording` })
  let disconnect = model.connect()
  await flush()
  model.seek(1000, true)
  await flush()
  model.openRecording(saved.id)
  model.seek(4000, true)
  await flush()
  assert.equal(get(model.view).live.desiredCursorMs, 1000)
  assert.equal(get(model.view).replay.desiredCursorMs, 4000)
  disconnect()
  disconnect = model.connect()
  await flush()
  assert.equal(calls.filter(call => call.method === `getStatus`).length, 2)
  assert.equal(get(model.view).live.desiredCursorMs, 1000)
  assert.equal(get(model.view).replay.desiredCursorMs, 4000)
  disconnect()
})

test(`a paused live cursor stays resolved while capture commits a new head`, async () => {
  const { model, calls, update } = fixture({ ...saved, state: `recording` })
  const disconnect = model.connect()
  await flush()
  model.seek(2000, true)
  await flush()
  const reads = calls.filter(call => call.method === `getFrame`).length
  update({ protocolVersion: 1, recordingId: saved.id, revision: 2,
    cursor: { generation: `generation`, updateSequence: 2 }, committedHead: { sequence: 6, elapsedUs: 20_000_000 }, kind: `changed`, state: `recording` })
  await flush()
  assert.equal(get(model.view).headMs, 20_000)
  assert.equal(get(model.view).live.cursorMs, 2000)
  assert.equal(calls.filter(call => call.method === `getFrame`).length, reads)
  disconnect()
})

test(`server defaults retain the last valid endpoint and manual overrides`, () => {
  const { model } = fixture()
  model.setServerAddress(`10.20.30.40:7777`)
  model.setServerAddress(null)
  assert.equal(get(model.view).endpoint, `10.20.30.40:7777`)
  model.setEndpoint(`127.0.0.1:8888`)
  model.setServerAddress(`10.20.30.41:7777`)
  assert.equal(get(model.view).endpoint, `127.0.0.1:8888`)
  model.useCurrentServer(`10.20.30.41:7777`)
  assert.equal(get(model.view).endpoint, `10.20.30.41:7777`)
  model.setServerAddress(`999.2.3.4:7777`)
  assert.equal(get(model.view).endpoint, `10.20.30.41:7777`)
})

test(`record uses the current server game port and keeps an active capture pinned`, async () => {
  const { model, calls } = fixture()
  model.setServerAddress(`10.20.30.40:11020`)
  await model.startRecording()
  assert.deepEqual(calls.find(call => call.method === `startRecording`)?.input, {
    endpoint: { host: `10.20.30.40`, port: 11020 }
  })
  model.setServerAddress(`10.20.30.41:10380`)
  assert.equal(get(model.view).endpoint, `10.20.30.40:11020`)
  assert.equal(get(model.view).liveSession?.serverName, `10.20.30.40:11020`)
})

test(`returning to automatic selection cannot reuse a manual address as the current server`, async () => {
  const { model, calls } = fixture()
  model.setEndpoint(`10.20.30.40:11020`)
  model.useCurrentServer(null)
  assert.equal(get(model.view).endpointOverride, false)
  assert.equal(get(model.view).endpoint, ``)
  await model.startRecording()
  assert.equal(calls.some(call => call.method === `startRecording`), false)
})

test(`a selected server records before joining and cannot be retargeted during capture`, async () => {
  const { model, calls } = fixture()
  model.selectServer({ id: 9, name: `Next server`, address: `192.0.2.9:11020` })
  model.setServerAddress(null)
  await model.startRecording()
  assert.deepEqual(calls.find(call => call.method === `startRecording`)?.input, {
    endpoint: { host: `192.0.2.9`, port: 11020 }
  })
  model.selectServer({ id: 10, name: `Other server`, address: `192.0.2.10:7777` })
  model.setEndpoint(`192.0.2.11:7777`)
  assert.equal(get(model.view).endpoint, `192.0.2.9:11020`)
  assert.equal(get(model.view).selectedServer?.id, 9)
  assert.equal(get(model.view).liveSession?.captureState, `recording`)
})

test(`capture is not shown active until startup resolves and a pending target stays fixed`, async () => {
  let finish!: (status: RecordingStatus) => void
  const model = new TelemetrySessionOrchestrator(() => ({
    startRecording: async () => new Promise(resolve => { finish = resolve })
  } as unknown as TelemetryApi))
  model.setEndpoint(`192.0.2.1:7777`)
  const pending = model.startRecording()
  assert.equal(get(model.view).busy, true)
  assert.equal(get(model.view).liveSession, null)
  model.useCurrentServer(`192.0.2.2:7777`)
  assert.equal(get(model.view).endpoint, `192.0.2.1:7777`)
  finish({ ...saved, endpoint: { host: `192.0.2.1`, port: 7777 }, state: `recording` })
  await pending
  assert.equal(get(model.view).liveSession?.captureState, `recording`)
  assert.equal(get(model.view).busy, false)
})

test(`a stale read view retries once and then exposes a stable failure`, async () => {
  const { model, calls } = fixture(null, `Read view generation changed`)
  const disconnect = model.connect()
  await flush()
  model.openRecording(saved.id)
  await flush()
  await flush()
  assert.equal(calls.filter(call => call.method === `getFrame`).length, 2)
  assert.match(get(model.view).error ?? ``, /generation changed/)
  assert.equal(get(model.view).loading, false)
  disconnect()
})

test(`new live heads respect frame and trail rates while unchanged heads issue no reads`, async context => {
  context.mock.timers.enable({ apis: [`setTimeout`] })
  const { model, calls, update, advance } = fixture({ ...saved, state: `recording` })
  const disconnect = model.connect()
  await flush()
  model.setTab(`map`)
  await flush()
  calls.length = 0
  for (let index = 1; index <= 10; index++) {
    advance(100)
    update({ protocolVersion: 1, recordingId: saved.id, revision: index + 1,
      cursor: { generation: `generation`, updateSequence: index + 1 }, committedHead: { sequence: index + 5, elapsedUs: 10_000_000 + index * 100_000 },
      kind: `changed`, state: `recording` })
    context.mock.timers.tick(100)
    await flush()
  }
  assert.equal(calls.filter(call => call.method === `getFrame`).length, 10)
  assert.equal(calls.filter(call => call.method === `getTrajectories`).length, 2)
  calls.length = 0
  advance(1000)
  context.mock.timers.tick(1000)
  await flush()
  assert.equal(calls.filter(call => call.method === `getFrame`).length, 0)
  model.setTab(`overview`)
  await flush()
  calls.length = 0
  for (let index = 1; index <= 10; index++) {
    advance(100)
    update({ protocolVersion: 1, recordingId: saved.id, revision: index + 20,
      cursor: { generation: `generation`, updateSequence: index + 20 }, committedHead: { sequence: index + 30, elapsedUs: 20_000_000 + index * 100_000 },
      kind: `changed`, state: `recording` })
    context.mock.timers.tick(100)
    await flush()
  }
  assert.equal(calls.filter(call => call.method === `getFrame`).length, 5)
  disconnect()
})

test(`a saved recording metadata invalidation rereads once without moving a paused cursor`, async () => {
  const { model, calls, update } = fixture()
  const disconnect = model.connect()
  await flush()
  model.openRecording(saved.id)
  model.seek(5000, true)
  await flush()
  calls.length = 0
  const message: TelemetryUpdate = { protocolVersion: 1, recordingId: saved.id, revision: 1,
    cursor: { generation: saved.generation, updateSequence: 1 }, committedHead: saved.head, kind: `changed`, state: `saved` }
  update(message)
  await flush()
  assert.equal(calls.filter(call => call.method === `getFrame`).length, 0)
  update({ ...message, revision: 2, cursor: { ...message.cursor, updateSequence: 2 } })
  await flush()
  assert.equal(calls.filter(call => call.method === `getFrame`).length, 1)
  assert.equal(get(model.view).replay.cursorMs, 5000)
  disconnect()
})

test(`event pagination follows the worker offset after a short page and restores the previous page`, async () => {
  const { model, calls } = fixture()
  const disconnect = model.connect()
  await flush()
  model.openRecording(saved.id)
  model.setTab(`combat`)
  await flush()
  model.setEventPage(`combat`, 2)
  await flush()
  const pages = calls.filter(call => call.method === `getEvents`).map(call => (call.input as { offset: number }).offset)
  assert.deepEqual(pages, [0, 7])
  assert.equal(model.getSnapshot()?.eventPage?.page, 2)
  model.setEventPage(`combat`, 1)
  await flush()
  assert.equal(model.getSnapshot()?.eventPage?.page, 1)
  assert.equal(get(model.view).filters.replay.combat.offsets[0], 0)
  disconnect()
})

test(`releasing a seek at the same input position completes a replacement cohort`, async () => {
  const { model, calls, advance } = fixture()
  const disconnect = model.connect()
  await flush()
  model.openRecording(saved.id)
  await flush()
  advance(100)
  model.seek(5000)
  model.seek(5000, true)
  await flush()
  assert.equal(model.workspace().cursorMs, 5000)
  assert.equal(model.workspace().desiredCursorMs, 5000)
  assert.equal(get(model.view).loading, false)
  assert.equal(calls.filter(call => call.method === `getFrame`).length, 3)
  disconnect()
})

test(`text-filtered live and replay event cohorts refresh together at 2 Hz`, async context => {
  context.mock.timers.enable({ apis: [`setTimeout`] })
  const { model, calls, update, advance } = fixture({ ...saved, state: `recording` })
  const disconnect = model.connect()
  context.after(disconnect)
  await flush()
  let step = 0
  for (const source of [`live`, `replay`] as const) {
    if (source === `replay`) model.openRecording(saved.id)
    for (const tab of [`kills`, `combat`, `items`] as const) {
      model.setTab(tab)
      model.setFilter(tab, { query: `player`, kind: `` })
      if (source === `replay`) model.play()
      await flush()
      calls.length = 0
      for (const _ of Array.from({ length: 10 })) {
        advance(100)
        step++
        if (source === `live`) update({ protocolVersion: 1, recordingId: saved.id, revision: step + 1,
          cursor: { generation: `generation`, updateSequence: step + 1 },
          committedHead: { sequence: step + 5, elapsedUs: 10_000_000 + step * 100_000 }, kind: `changed`, state: `recording` })
        context.mock.timers.tick(100)
        await flush()
      }
      const frames = calls.filter(call => call.method === `getFrame`).map(call => (call.input as { atUs: number }).atUs)
      const events = calls.filter(call => call.method === `getEvents`).map(call => (call.input as { toUs: number }).toUs)
      assert.equal(frames.length, 2, `${source} ${tab}`)
      assert.deepEqual(events, frames)
    }
  }
})

test(`search edits, released seeks, player and tab changes bypass the filtered automatic rate`, async context => {
  context.mock.timers.enable({ apis: [`setTimeout`] })
  const { model, calls, update, advance } = fixture({ ...saved, state: `recording` })
  const disconnect = model.connect()
  context.after(disconnect)
  await flush()
  model.setTab(`combat`)
  model.setFilter(`combat`, { query: `player`, kind: `` })
  await flush()
  for (const interact of [
    () => model.setFilter(`combat`, { query: `target`, kind: `` }),
    () => model.seek(5000, true),
    () => model.selectPlayer(`track`),
    () => model.setTab(`kills`)
  ]) {
    calls.length = 0
    interact()
    await flush()
    assert.equal(calls.filter(call => call.method === `getFrame`).length, 1)
    assert.equal(calls.filter(call => call.method === `getEvents`).length, 1)
  }
  model.setFilter(`kills`, { query: ``, kind: `` })
  model.goLive()
  await flush()
  calls.length = 0
  for (const index of Array.from({ length: 10 }, (_, index) => index + 1)) {
    advance(100)
    update({ protocolVersion: 1, recordingId: saved.id, revision: index + 1,
      cursor: { generation: `generation`, updateSequence: index + 1 },
      committedHead: { sequence: index + 5, elapsedUs: 10_000_000 + index * 100_000 }, kind: `changed`, state: `recording` })
    context.mock.timers.tick(100)
    await flush()
  }
  assert.equal(calls.filter(call => call.method === `getFrame`).length, 5)
  assert.equal(calls.filter(call => call.method === `getEvents`).length, 5)
})
