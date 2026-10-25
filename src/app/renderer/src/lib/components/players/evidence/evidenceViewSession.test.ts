import assert from 'node:assert/strict'
import test from 'node:test'
import { get } from 'svelte/store'
import { createEvidenceViewSession } from './evidenceViewSession'

test(`records only one successful view per opening and retries with the same session`, async () => {
  const calls: Array<[number, string, number]> = []
  const counts: number[] = []
  const session = createEvidenceViewSession({ id: 11, viewCount: 3 }, {
    sessionId: `11111111-1111-4111-8111-111111111111`,
    record: async (id, sessionId, watchedMs) => {
      calls.push([id, sessionId, watchedMs])
      if (calls.length === 1) throw new Error(`Temporary failure`)
      return { viewCount: 4 }
    },
    onRecorded: count => counts.push(count)
  })
  await session.record()
  await session.record()
  assert.deepEqual(calls, [
    [11, `11111111-1111-4111-8111-111111111111`, 2000],
    [11, `11111111-1111-4111-8111-111111111111`, 2000]
  ])
  assert.deepEqual(counts, [4])
  assert.equal(get(session).viewCount, 4)
  assert.equal(get(session).recorded, true)
})

test(`failed view requests have bounded retries and never increment the displayed count`, async () => {
  let attempts = 0
  const session = createEvidenceViewSession({ id: 11 }, {
    record: async () => {
      attempts++
      throw new Error(`Offline`)
    }
  })
  await session.record()
  assert.equal(attempts, 2)
  assert.equal(get(session).viewCount, 0)
  assert.equal(get(session).recording, false)
  assert.equal(get(session).recorded, false)
})

test(`an in-flight request cannot duplicate a view or update a disposed opening`, async () => {
  let resolve!: (value: { viewCount: number }) => void
  const pending = new Promise<{ viewCount: number }>(done => { resolve = done })
  let requests = 0
  const counts: number[] = []
  const session = createEvidenceViewSession({ id: 11, viewCount: 3 }, {
    record: async () => {
      requests++
      return await pending
    },
    onRecorded: count => counts.push(count)
  })
  const recording = session.record()
  await session.record()
  session.dispose()
  resolve({ viewCount: 4 })
  await recording
  assert.equal(requests, 1)
  assert.deepEqual(counts, [])
  assert.equal(get(session).viewCount, 3)
})

test(`a delayed view response preserves a newer count refreshed from the server`, async () => {
  let resolve!: (value: { viewCount: number }) => void
  const pending = new Promise<{ viewCount: number }>(done => { resolve = done })
  const counts: number[] = []
  const session = createEvidenceViewSession({ id: 11, viewCount: 3 }, {
    record: async () => await pending,
    onRecorded: count => counts.push(count)
  })
  const recording = session.record()
  session.syncCount(6)
  resolve({ viewCount: 4 })
  await recording
  assert.equal(get(session).viewCount, 6)
  assert.deepEqual(counts, [6])
})
