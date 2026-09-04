import assert from "node:assert/strict"
import test from "node:test"
import {
  getPlayerDisplayName,
  getPlayerRowDisplayName,
  getServerDisplayName,
  getServerLabel
} from "./displayNames"

test(`getPlayerDisplayName keeps the original nickname for display`, () => {
  assert.equal(getPlayerDisplayName(`  Ŧhe  Original  `), `  Ŧhe  Original  `)
  assert.equal(getPlayerDisplayName(`   `), `Unknown player`)
})

test(`getPlayerRowDisplayName preserves the PlayerRow title path`, () => {
  assert.equal(
    getPlayerRowDisplayName({ name: `  Exact  Row  ` }),
    `  Exact  Row  `
  )
})

test(`getServerLabel prefers the stored display name`, () => {
  assert.equal(
    getServerLabel({ name: `[TT] HOUSE OF THE TEMPLARS 1V1 DUEL`, displayName: `Templars Duel` }),
    `Templars Duel`
  )
})

test(`getServerLabel falls back to the normalized raw name`, () => {
  assert.equal(getServerLabel({ name: `[TT] DUEL 1v1`, displayName: `   ` }), `[TT]DUEL`)
  assert.equal(getServerLabel({ name: `[TT] DUEL 1v1` }), `[TT]DUEL`)
})

test(`getServerLabel falls back to the default label without a server`, () => {
  assert.equal(getServerLabel(null), getServerDisplayName(null))
  assert.equal(getServerLabel(null), `Current game server`)
})
