import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readUpdates, TelemetryClient } from './telemetryClient'
import { setTimeout as delay } from 'node:timers/promises'

const update = {
  protocolVersion: 1,
  recordingId: `34b61043-c474-48fa-97af-62408c7ed02e`,
  revision: 1,
  cursor: { generation: `34b61043-c474-48fa-97af-62408c7ed02e`, updateSequence: 1 },
  committedHead: { sequence: 0, elapsedUs: 0 },
  kind: `changed`,
  state: `recording`
}

test(`a bounded shutdown request cancels a stalled worker response`, async () => {
  const client = new TelemetryClient(`http://127.0.0.1:1`, `unused`, new AbortController().signal,
    async (_input, init) => {
      await delay(1000, undefined, { signal: init?.signal ?? undefined })
      return new Response(`{}`)
    })
  await assert.rejects(client.call(`/status`, undefined, `GET`, 10), { name: `AbortError` })
})

test(`superseding a read cancels its HTTP work before the normal timeout`, async () => {
  const abort = new AbortController()
  let observed: AbortSignal | null | undefined
  const client = new TelemetryClient(`http://127.0.0.1:1`, `unused`, new AbortController().signal,
    async (_input, init) => {
      observed = init?.signal
      abort.abort()
      await delay(20, undefined, { signal: init?.signal ?? undefined })
      return new Response(`{}`)
    })
  await assert.rejects(client.call(`/status`, undefined, `GET`, 1000, abort.signal), { name: `AbortError` })
  assert.equal(observed?.aborted, true)
})
test(`NDJSON survives arbitrary byte boundaries and validates each update`, async () => {
  const bytes = new TextEncoder().encode(JSON.stringify(update) + `\n`)
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (const byte of bytes) c.enqueue(Uint8Array.of(byte))
      c.close()
    }
  })
  const rows = []
  for await (const row of readUpdates(stream)) rows.push(row)
  assert.deepEqual(rows, [update])
})
test(`rejects a truncated or incompatible update`, async () => {
  for (const input of [
    JSON.stringify(update),
    JSON.stringify({ ...update, protocolVersion: 2 }) + `\n`,
    `x`.repeat(1024 * 1024 + 1)
  ]) {
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(input))
        c.close()
      }
    })
    await assert.rejects(async () => {
      for await (const _ of readUpdates(stream)) {
        /* consume */
      }
    })
  }
})
