import assert from 'node:assert/strict'
import test from 'node:test'
import type { EvidenceComment } from '$lib/core'
import { evidencePositionMs, evidenceSeekPosition, formatEvidenceTime, groupEvidenceComments, nextEvidenceMarkerComment } from './evidenceTimeline'

test(`places valid timed comments against the actual duration and keeps the start of the video`, () => {
  const groups = groupEvidenceComments([
    comment(1, 0), comment(2, 2500), comment(3, 10000), comment(4, null), comment(5),
    comment(6, -1), comment(7, NaN), comment(8, 10001), comment(9, Infinity)
  ], 10000, 1000)
  assert.deepEqual(groups.map(group => ({ position: group.percentage, ids: group.comments.map(item => item.id) })), [
    { position: 0, ids: [1] }, { position: 25, ids: [2] }, { position: 100, ids: [3] }
  ])
  assert.deepEqual(groupEvidenceComments([comment(1, 0)], 0, 1000), [])
  assert.deepEqual(groupEvidenceComments([comment(1, 0)], NaN, 1000), [])
  for (const width of [0, -1, NaN, Infinity]) assert.deepEqual(groupEvidenceComments([comment(1, 0)], 10000, width), [])
})

test(`groups overlapping avatar positions without losing any comments at compact widths`, () => {
  const comments = [comment(5, 9000), comment(3, 2100), comment(2, 2000), comment(1, 2000), comment(4, 3000)]
  const compact = groupEvidenceComments(comments, 10000, 200)
  assert.deepEqual(compact.map(group => group.comments.map(item => item.id)), [[1, 2, 3, 4], [5]])
  const wide = groupEvidenceComments(comments, 10000, 1000)
  assert.deepEqual(wide.map(group => group.comments.map(item => item.id)), [[1, 2, 3], [4], [5]])
})

test(`repeated marker selection cycles through every overlapping comment and wraps`, () => {
  const comments = [comment(1, 2000), comment(2, 2000), comment(3, 2100)]
  assert.equal(nextEvidenceMarkerComment(comments, null)?.id, 1)
  assert.equal(nextEvidenceMarkerComment(comments, 1)?.id, 2)
  assert.equal(nextEvidenceMarkerComment(comments, 2)?.id, 3)
  assert.equal(nextEvidenceMarkerComment(comments, 3)?.id, 1)
  assert.equal(nextEvidenceMarkerComment(comments, 99)?.id, 1)
  assert.equal(nextEvidenceMarkerComment([], null), null)
})

test(`nearby timeline comments remain accessible when larger avatars overlap`, () => {
  const groups = groupEvidenceComments([comment(1, 0), comment(2, 800), comment(3, 1600)], 10000, 500)
  assert.deepEqual(groups.map(group => group.comments.map(item => item.id)), [[1, 2], [3]])
  assert.equal(nextEvidenceMarkerComment(groups[0]!.comments, 1)?.id, 2)
  assert.equal(nextEvidenceMarkerComment(groups[0]!.comments, 2)?.id, 1)
})

test(`a dense sequence keeps distinct timeline positions instead of merging the whole sequence`, () => {
  const groups = groupEvidenceComments([comment(1, 0), comment(2, 500), comment(3, 1000), comment(4, 1500)], 10000, 500)
  assert.deepEqual(groups.map(group => ({ position: group.percentage, ids: group.comments.map(item => item.id) })), [
    { position: 0, ids: [1, 2] }, { position: 10, ids: [3, 4] }
  ])
})

test(`snapshots and seeks use bounded video milliseconds and reject invalid seek input`, () => {
  assert.equal(evidencePositionMs(12.3459, 20), 12345)
  assert.equal(evidencePositionMs(12.3459, 10), 10000)
  assert.equal(evidencePositionMs(NaN, 10), 0)
  assert.equal(evidencePositionMs(-1, 10), 0)
  assert.equal(evidenceSeekPosition(0, 10000), 0)
  assert.equal(evidenceSeekPosition(12345, 10000), 10000)
  assert.equal(evidenceSeekPosition(5678.9, 10000), 5678)
  for (const invalid of [NaN, Infinity, -1]) assert.equal(evidenceSeekPosition(invalid, 10000), null)
  assert.equal(evidenceSeekPosition(2000, 0), null)
})

test(`comment timestamps floor milliseconds and show a padded minute and second value`, () => {
  assert.equal(formatEvidenceTime(0), `00:00`)
  assert.equal(formatEvidenceTime(59999), `00:59`)
  assert.equal(formatEvidenceTime(60000), `01:00`)
  assert.equal(formatEvidenceTime(3661999), `61:01`)
})

function comment(id: number, positionMs?: number | null): EvidenceComment {
  return {
    id, evidenceId: 11, authorId: 8, authorName: `Admin`, body: `Comment ${id}`, positionMs,
    createdAt: `2026-09-28T10:00:00Z`,
    actionReferences: [], userReferences: [], playerReferences: []
  }
}
