import assert from 'node:assert/strict'
import test from 'node:test'
import { parsePlayerListQuery } from './playerListQuery.js'

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
