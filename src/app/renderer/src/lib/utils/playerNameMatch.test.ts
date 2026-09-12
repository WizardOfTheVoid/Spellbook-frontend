import assert from 'node:assert/strict'
import test from 'node:test'
import { matchPlayerFromText } from './playerNameMatch'
import { mergePlayerState } from './playerStateData'

test(`matches plain OCR text to a decorated raw name without a database alias`, () => {
  const name = `\u1e6e\u1e6e\u1d38 \u01b5\u20b3\u2c64\u20b3\u0189`
  const player = mergePlayerState({ index: 1, name, playfabId: `ABC123`, rawLine: name }, null)
  const result = matchPlayerFromText([`TTL ZARAD`], [player])
  assert.equal(result.best?.player, player)
  assert.equal(result.best?.confidence, 1)
  assert.equal(player.name, name)
})

test(`uses custom symbol replacements for OCR candidates as well as player names`, () => {
  const name = `MAGIC heart`
  const player = mergePlayerState({ index: 1, name, playfabId: `ABC123`, rawLine: name }, null)
  const result = matchPlayerFromText([`M\u2206GIC    \u2665`], [player])
  assert.equal(result.best?.confidence, 1)
  assert.equal(result.best?.matchedText, `magic heart`)
})
