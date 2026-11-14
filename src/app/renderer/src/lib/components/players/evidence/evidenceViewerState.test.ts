import assert from 'node:assert/strict'
import test from 'node:test'
import type { EvidenceItem } from '$lib/core'
import { canDeleteEvidence, canDeleteEvidenceComment, findEvidenceReturnItem, mergeEvidenceRefresh, readEvidenceVolume, saveEvidenceVolume } from './evidenceViewerState'

test(`video volume starts at half and restores the last selected setting`, () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) }
  }
  assert.equal(readEvidenceVolume(storage), 0.5)
  saveEvidenceVolume(storage, 0.24)
  assert.equal(readEvidenceVolume(storage), 0.24)
  saveEvidenceVolume(storage, 0)
  assert.equal(readEvidenceVolume(storage), 0)
})

test(`invalid or inaccessible saved volume keeps playback at half`, () => {
  for (const value of [``, `null`, `NaN`, `-1`, `1.1`]) {
    assert.equal(readEvidenceVolume({ getItem: () => value }), 0.5)
  }
  assert.equal(readEvidenceVolume({ getItem: () => { throw new Error(`Storage unavailable`) } }), 0.5)
  assert.doesNotThrow(() => saveEvidenceVolume({ setItem: () => { throw new Error(`Storage unavailable`) } }, 0.3))
})

test(`only a superadmin can delete evidence, while comment authors can delete their own`, () => {
  assert.equal(canDeleteEvidence(null), false)
  assert.equal(canDeleteEvidence({ id: 7, isSuperadmin: false }), false)
  assert.equal(canDeleteEvidence({ id: 7, isSuperadmin: true }), true)
  assert.equal(canDeleteEvidenceComment({ authorId: 7 }, null), false)
  assert.equal(canDeleteEvidenceComment({ authorId: 7 }, { id: 7, isSuperadmin: false }), true)
  assert.equal(canDeleteEvidenceComment({ authorId: 7 }, { id: 8, isSuperadmin: false }), false)
  assert.equal(canDeleteEvidenceComment({ authorId: 7 }, { id: 8, isSuperadmin: true }), true)
})

test(`a delayed evidence refresh preserves locally saved offense links and the newest view count`, () => {
  const current = evidence({ offenseIds: [7, 8], viewCount: 4 })
  const refreshed = evidence({ offenseIds: [2], viewCount: 3, duplicateCount: 5 })
  const merged = mergeEvidenceRefresh(current, refreshed, true)
  assert.deepEqual(merged.offenseIds, [7, 8])
  assert.equal(merged.viewCount, 4)
  assert.equal(merged.duplicateCount, 5)
  assert.deepEqual(mergeEvidenceRefresh(current, refreshed, false).offenseIds, [2])
  assert.equal(mergeEvidenceRefresh(current, evidence({ viewCount: 6 }), true).viewCount, 6)
})

function evidence(patch: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    id: 11, playerId: 42, playfabId: `ABC123`, nickname: `Player`, type: `cheating`, subtypes: [`flying`],
    createdAt: `2026-09-28T10:00:00Z`, authorName: `Admin`, duplicateCount: 0, duplicates: [],
    file: { kind: `video`, mimeType: `video/mp4`, byteSize: 100, width: 320, height: 240, durationMs: 5000, url: `/video.mp4` },
    evidenceUrl: `/evidence/11`, embedUrl: `/media/11`, wantedUrl: `/wanted/42`, playerUrl: `/players/42`,
    isWanted: true, candidateId: null, ...patch
  }
}

test(`a delayed evidence refresh preserves comment additions and deletions made since it began`, () => {
  for (const count of [2, 4]) {
    const current = evidence({ commentCount: count })
    const refreshed = evidence({ commentCount: 3 })
    assert.equal(mergeEvidenceRefresh(current, refreshed, false, true).commentCount, count)
    assert.equal(mergeEvidenceRefresh(current, refreshed, false).commentCount, 3)
  }
})

test(`returning from related evidence restores its listed origin`, () => {
  const first = evidence({ id: 11 })
  const origin = evidence({ id: 12 })
  assert.equal(findEvidenceReturnItem([first, origin], 12), origin)
})

test(`returning from related evidence falls back after the origin is removed`, () => {
  const first = evidence({ id: 11 })
  assert.equal(findEvidenceReturnItem([first], 99), first)
  assert.equal(findEvidenceReturnItem([first], null), first)
  assert.equal(findEvidenceReturnItem([], 12), null)
})
