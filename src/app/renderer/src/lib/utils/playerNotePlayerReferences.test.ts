import assert from 'node:assert/strict'
import test from 'node:test'
import { parsePlayerNoteReferences } from './playerNotePlayerReferences'
import { parsePlayerNoteDisplay } from './playerNoteDisplay'

test(`player references are opt in and keep existing action and user IDs`, () => {
  const content = `@[player:42] #[action:9] @[user:7]`
  assert.deepEqual(parsePlayerNoteReferences(content, true).filter(segment => segment.type === `reference`), [
    { type: `reference`, kind: `player`, id: 42 },
    { type: `reference`, kind: `action`, id: 9 },
    { type: `reference`, kind: `user`, id: 7 }
  ])
  assert.deepEqual(parsePlayerNoteReferences(`@[player:42]`), [{ type: `text`, text: `@[player:42]` }])
  assert.deepEqual(parsePlayerNoteReferences(`@[player:0] @[player:9007199254740992]`, true), [
    { type: `text`, text: `@[player:0] @[player:9007199254740992]` }
  ])
})

test(`comment display uses note Markdown and hydrated player reference tokens`, () => {
  assert.deepEqual(parsePlayerNoteDisplay(`**Checked** @[player:42]`, true), [
    { type: `strong`, content: [{ type: `text`, content: `Checked` }] },
    { type: `text`, content: ` ` },
    { type: `reference`, kind: `player`, id: 42 }
  ])
})
