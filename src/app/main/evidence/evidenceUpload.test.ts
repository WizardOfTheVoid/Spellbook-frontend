import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { ServerHttpClient } from '../api/server-http-client'

test(`Electron binary upload receives server progress while conversion is pending`, async () => {
  const directory = await mkdtemp(join(tmpdir(), `evidence-upload-`))
  const path = join(directory, `clip.mp4`)
  const size = 1024 * 1024
  await writeFile(path, Buffer.alloc(size, 1))
  let completed = false
  const progress: unknown[] = []
  const server = createServer(async (request, response) => {
    assert.equal(request.headers.accept, `application/x-ndjson`)
    assert.equal(request.headers.authorization, `Bearer test-session`)
    response.setHeader(`Content-Type`, `application/x-ndjson`)
    response.flushHeaders()
    let received = 0
    for await (const chunk of request) {
      received += chunk.length
      response.write(`${JSON.stringify({ progress: { phase: `uploading`, completed: received, total: size } })}\n`)
    }
    await delay(30)
    completed = true
    response.end(`${JSON.stringify({ result: { ok: true, status: 201, statusText: `Created`, data: { ok: true, data: { id: 7 } } } })}\n`)
  })
  server.listen(0, `127.0.0.1`)
  await once(server, `listening`)
  try {
    const address = server.address()
    assert.ok(address && typeof address !== `string`)
    const client = new ServerHttpClient(`http://127.0.0.1:${address.port}`, `test-session`)
    const result = await client.uploadEvidence(path, { playerId: 2 }, update => {
      assert.equal(completed, false)
      progress.push(update)
    })
    assert.equal(result.ok, true)
    assert.deepEqual(progress.at(-1), { phase: `uploading`, completed: size, total: size })
    assert.deepEqual(result.data, { ok: true, data: { id: 7 } })
  } finally {
    server.closeAllConnections()
    server.close()
    await rm(directory, { recursive: true, force: true })
  }
})
