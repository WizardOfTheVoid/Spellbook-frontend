import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeString } from './normalizeString.js'

test(`maps custom symbols before transliteration and preserves case and punctuation`, () => {
  assert.equal(normalizeString(`name`, `M\u2206GIC \u2665`), `MAGIC heart`)
  assert.equal(normalizeString(`game`, `\u1e6e\u1e6e\u1d38 \u01b5\u20b3\u2c64\u20b3\u0189.`), `TTL ZARAD.`)
})

test(`caps existing spaces at two for game text and one for names`, () => {
  assert.equal(normalizeString(`game`, `  One     Two  Three `), `One  Two  Three`)
  assert.equal(normalizeString(`name`, `  One     Two  Three `), `One Two Three`)
})

test(`converts tabs after capping spaces and trims after transliteration`, () => {
  assert.equal(normalizeString(`game`, `\tOne   \t\tTwo\t`), `One    Two`)
  assert.equal(normalizeString(`name`, `\tOne   \t\tTwo\t`), `One   Two`)
  assert.equal(normalizeString(`name`, `\u200b Player \u200b`), `Player`)
})

test(`keeps command validation and database length limits outside normalization`, () => {
  assert.equal(normalizeString(`game`, `One\n"Two"`), `One\n"Two"`)
  assert.equal(normalizeString(`name`, `A`.repeat(300)), `A`.repeat(300))
  assert.equal(normalizeString(`name`, ``), ``)
})
