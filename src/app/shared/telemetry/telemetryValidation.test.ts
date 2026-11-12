import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isEndpoint, isPlayFabId, isTelemetryUpdate, isVec3 } from './telemetryValidation'
import { readFileSync } from 'node:fs'

test(`preserves variable width PlayFab IDs and rejects untyped account data`, () => {
  assert.equal(isPlayFabId(`D6A2C4BB2600FA9`), true)
  assert.equal(isPlayFabId(`f`), true)
  for (const value of [``, `z`, `12345678901234567`, 123, null])
    assert.equal(isPlayFabId(value), false)
})
test(`validates numeric endpoint and finite coordinates`, () => {
  assert.equal(isEndpoint({ host: `127.0.0.1`, port: 7777 }), true)
  assert.equal(isEndpoint({ host: `host/path`, port: 7777 }), false)
  assert.equal(isEndpoint({ host: `127.0.0.1`, port: 65536 }), false)
  assert.equal(isVec3({ x: 1, y: 2, z: 3 }), true)
  assert.equal(isVec3({ x: Infinity, y: 2, z: 3 }), false)
})
test(`stream cursor is independent of a frozen capture head`, () => {
  const update = {
    protocolVersion: 1,
    recordingId: `34b61043-c474-48fa-97af-62408c7ed02e`,
    revision: 3,
    cursor: { generation: `34b61043-c474-48fa-97af-62408c7ed02e`, updateSequence: 7 },
    committedHead: { sequence: 5, elapsedUs: 1000 },
    kind: `changed`,
    state: `saved`
  }
  assert.equal(isTelemetryUpdate(update), true)
  assert.equal(isTelemetryUpdate({ ...update, protocolVersion: 2 }), false)
  assert.equal(
    isTelemetryUpdate({ ...update, cursor: { ...update.cursor, updateSequence: NaN } }),
    false
  )
})
test(`validates the same serialized update fixture as C#`, () => {
  const fixture = JSON.parse(
    readFileSync(new URL(`./fixtures/update.json`, import.meta.url), `utf8`)
  )
  assert.equal(isTelemetryUpdate(fixture), true)
  assert.equal(fixture.cursor.updateSequence, 7)
  assert.equal(fixture.committedHead.sequence, 5)
})
