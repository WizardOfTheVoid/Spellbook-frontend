import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TelemetryReads } from './telemetryReads'

const context = (requestId: number, workspaceId = `live`) => ({
  recordingId: `recording-one`, workspaceId, requestId
})

test(`new manual seeks abort the old cohort while dependent reads share a signal`, () => {
  const reads = new TelemetryReads()
  const old = reads.begin(context(1))
  const frame = reads.begin(context(2))
  const events = reads.begin(context(2))
  assert.equal(old.signal.aborted, true)
  assert.equal(frame.signal, events.signal)
  assert.equal(frame.signal.aborted, false)
  assert.throws(() => reads.begin(context(1)), { name: `AbortError` })
})

test(`cancellation is workspace scoped, persists through completion and does not cancel newer work`, () => {
  const reads = new TelemetryReads()
  const live = reads.begin(context(3))
  const replay = reads.begin(context(9, `replay`))
  live.finish()
  reads.cancel(`live`, 3)
  assert.equal(live.signal.aborted, true)
  assert.equal(replay.signal.aborted, false)
  assert.throws(() => reads.begin(context(3)), { name: `AbortError` })
  const newer = reads.begin(context(4))
  reads.cancel(`live`, 3)
  assert.equal(newer.signal.aborted, false)
})

test(`access cleanup aborts legacy and pinned reads and permits a new account sequence`, () => {
  const reads = new TelemetryReads()
  const pinned = reads.begin(context(10))
  const legacy = reads.begin({})
  reads.clear()
  assert.equal(pinned.signal.aborted, true)
  assert.equal(legacy.signal.aborted, true)
  assert.equal(reads.begin(context(0)).signal.aborted, false)
})

test(`malformed contexts and reuse across recordings are rejected`, () => {
  const reads = new TelemetryReads()
  for (const input of [{ workspaceId: `other`, requestId: 1 }, { workspaceId: `live` }, { workspaceId: `live`, requestId: -1 }])
    assert.throws(() => reads.begin(input))
  reads.begin(context(1))
  assert.throws(() => reads.begin({ ...context(1), recordingId: `recording-two` }))
})
