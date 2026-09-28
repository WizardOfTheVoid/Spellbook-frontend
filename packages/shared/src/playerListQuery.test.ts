import assert from 'node:assert/strict'
import test from 'node:test'
import { parsePlayerListQuery } from './playerListQuery.js'

test(`accepts wanted date sorting and exact playtime hours`, () => {
  const query = parsePlayerListQuery({ sortBy: `wantedAt`, minPlaytimeHours: 137, maxPlaytimeHours: 9999 })
  assert.equal(query.sortBy, `wantedAt`)
  assert.equal(query.sortOrder, `desc`)
  assert.equal(query.minPlaytimeHours, 137)
  assert.equal(query.maxPlaytimeHours, 9999)
})

test(`parses the no-rank filter alongside search and punishment filters`, () => {
  const query = parsePlayerListQuery({ noRank: `true`, search: ` Jane `, banned: true, minOffenses: 2 })
  assert.equal(query.noRank, true)
  assert.equal(query.search, `Jane`)
  assert.equal(query.banned, true)
  assert.equal(query.minOffenses, 2)
  assert.equal(parsePlayerListQuery({ noRank: false, minRank: 50 }).minRank, 50)
})

test(`rejects incompatible or invalid no-rank queries`, () => {
  for (const bounds of [{ minRank: 1 }, { maxRank: 49 }]) {
    assert.throws(() => parsePlayerListQuery({ noRank: true, ...bounds }), /rank bounds/u)
  }
  assert.throws(() => parsePlayerListQuery({ noRank: `unknown` }), /noRank/u)
})

test(`accepts last-seen date bounds and rejects reversed or invalid ranges`, () => {
  assert.deepEqual(
    (({ lastSeenAfter, lastSeenBefore }) => ({ lastSeenAfter, lastSeenBefore }))(
      parsePlayerListQuery({ lastSeenAfter: `2026-08-29`, lastSeenBefore: `2026-09-27` })
    ),
    { lastSeenAfter: `2026-08-29`, lastSeenBefore: `2026-09-27` }
  )
  assert.throws(() => parsePlayerListQuery({ lastSeenAfter: `2026-09-28`, lastSeenBefore: `2026-09-27` }), /lastSeenAfter/u)
  assert.throws(() => parsePlayerListQuery({ lastSeenAfter: `2026-02-30` }), /lastSeenAfter/u)
})
