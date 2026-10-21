import assert from 'node:assert/strict'
import test from 'node:test'
import { createPlayerAppUrl, createPlayerWebUrl, parseAppUrl, parsePlayerAppUrl, validPlayerLinkId } from './appLinks'

test(`player links use the canonical web and app destinations`, () => {
  assert.equal(createPlayerWebUrl(`ABC_123`), `https://chivalry2.dev/sb/players/ABC_123`)
  assert.equal(createPlayerAppUrl(`ABC_123`), `spellbook://players/ABC_123`)
  assert.deepEqual(parsePlayerAppUrl(`spellbook://players/ABC_123`), { playfabId: `ABC_123` })
})

test(`wanted and evidence links resolve to their own destinations`, () => {
  assert.deepEqual(parseAppUrl(`spellbook://wanted/ABC_123`), { kind: `wanted`, playfabId: `ABC_123` })
  assert.deepEqual(parseAppUrl(`spellbook://evidence/${`a`.repeat(64)}`), { kind: `evidence`, token: `a`.repeat(64) })
  assert.equal(parseAppUrl(`spellbook://evidence/${`a`.repeat(63)}`), null)
  assert.equal(parseAppUrl(`spellbook://wanted/ABC_123?next=bad`), null)
  assert.equal(parseAppUrl(`spellbook://wanted/NULL`), null)
})

test(`player links reject malformed IDs, unresolved identities and unowned destinations`, () => {
  for (const id of [``, `A`, `ABC/123`, `<script>`, `a`.repeat(129), `NULL`, `null`]) {
    assert.equal(validPlayerLinkId(id), false)
    assert.throws(() => createPlayerWebUrl(id), RangeError)
    assert.equal(parsePlayerAppUrl(`spellbook://players/${id}`), null)
  }
  for (const value of [
    `spellbook://user@players/ABC_123`,
    `spellbook://players:42/ABC_123`,
    `spellbook://players/ABC_123/other`,
    `spellbook://players/%2Fetc`,
    `spellbook://players/ABC_123#fragment`,
    `spellbook://players/ABC_123?next=https://bad.test`,
    `spellbook://players/OTHER/../ABC_123`,
    `spellbook://players/%2e/ABC_123`,
    `spellbook://players/ABC_123?`,
    `spellbook://players/ABC_123#`,
    `spellbook://@players/ABC_123`,
    `spellbook://unknown/ABC_123`
  ]) assert.equal(parsePlayerAppUrl(value), null, value)
})
