import assert from 'node:assert/strict'
import test from 'node:test'
import type { EvidenceSelectedFile } from '../core'
import { startEvidenceDuplicateChecks } from './evidenceDuplicates'

const files: EvidenceSelectedFile[] = [
  { id: `one`, name: `one.png`, kind: `image`, size: 20, originalSha256: `a`.repeat(64) },
  { id: `two`, name: `two.png`, kind: `image`, size: 30, originalSha256: `b`.repeat(64) }
]

test(`early duplicate matches warn without removing selected files`, async () => {
  const updates: Array<{ id: string, duplicateCount: number | null }> = []
  const previews = startEvidenceDuplicateChecks(files, item => updates.push(item), async size => ({
    count: size === 20 ? 1 : 0,
    matches: size === 20 ? [{ id: 9, playerId: 4, playfabId: `ABCDEF1234567890`, createdAt: `2026-09-27T12:00:00Z`, evidenceUrl: `https://example.com/sb/evidence/a` }] : []
  }))
  assert.equal(previews.length, 2)
  assert.deepEqual(previews.map(item => item.status), [`checking`, `checking`])
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(updates.map(item => item.duplicateCount), [1, 0])
})

test(`an unavailable duplicate check does not remove or block a file`, async () => {
  const updates: Array<{ id: string, duplicateCount: number | null }> = []
  const previews = startEvidenceDuplicateChecks(files, item => updates.push(item), async () => { throw new Error(`offline`) })
  assert.deepEqual(previews.map(item => item.id), [`one`, `two`])
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(updates.map(item => item.duplicateCount), [null, null])
})

test(`a stalled check leaves selected files available immediately`, async () => {
  const previews = startEvidenceDuplicateChecks(files, () => {}, async () => new Promise(() => {}))
  assert.deepEqual(previews.map(item => item.id), [`one`, `two`])
})
