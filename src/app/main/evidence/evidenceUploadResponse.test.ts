import assert from 'node:assert/strict'
import test from 'node:test'
import { setImmediate as flushTasks } from 'node:timers/promises'
import { readEvidenceUploadResponse } from './evidenceUploadResponse'

test(`fragmented progress arrives before the final result and preserves streamed failures`, async () => {
  const updates: unknown[] = []
  let stream: ReadableStreamDefaultController<Uint8Array>
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({ start(controller) { stream = controller } })
  const result = readEvidenceUploadResponse(new Response(body, { headers: { 'content-type': `application/x-ndjson` } }), update => updates.push(update))
  stream!.enqueue(encoder.encode(`{"progress":{"phase":"uploading","completed":10,`))
  stream!.enqueue(encoder.encode(`"total":20}}\n`))
  await flushTasks()
  assert.deepEqual(updates, [{ phase: `uploading`, completed: 10, total: 20 }])
  stream!.enqueue(encoder.encode(`{"result":{"ok":false,"status":400,"statusText":"INVALID_EVIDENCE","data":{"ok":false,"error":{"code":"INVALID_EVIDENCE","message":"Too long"}}}}\n`))
  stream!.close()
  assert.equal((await result).status, 400)
})

test(`an interrupted progress stream fails instead of claiming success`, async () => {
  const response = new Response(`{"progress":{"phase":"converting","completed":100,"total":1000}}\n`, { headers: { 'content-type': `application/x-ndjson` } })
  await assert.rejects(readEvidenceUploadResponse(response, () => {}), /ended before/u)
})

test(`ordinary JSON API responses remain compatible`, async () => {
  const response = new Response(JSON.stringify({ ok: true, data: { id: 7 } }), { status: 201 })
  const result = await readEvidenceUploadResponse(response)
  assert.equal(result.ok, true)
  assert.equal(result.status, 201)
  assert.deepEqual(result.data, { ok: true, data: { id: 7 } })
})
