import assert from 'node:assert/strict'
import test from 'node:test'
import {
  extractPlayerNoteReferenceIds,
  formatPlayerNoteText,
  parsePlayerNoteContent,
  serializePlayerNoteSegments
} from './playerNotes.js'

test(`player note references round-trip without changing Unicode`, () => {
  const content = `ÆØÅ #[action:42] said @magic, then @[user:7] checked #[action:42].`
  const segments = parsePlayerNoteContent(content)

  assert.deepEqual(extractPlayerNoteReferenceIds(content), {
    actionIds: [42],
    userIds: [7]
  })
  assert.equal(serializePlayerNoteSegments(segments), content)
  assert.equal(formatPlayerNoteText(content, {
    action: id => id === 42 ? `#Hacker ban · Action 42` : undefined,
    user: id => id === 7 ? `@Magic` : undefined
  }), `ÆØÅ #Hacker ban · Action 42 said @magic, then @Magic checked #Hacker ban · Action 42.`)
})

test(`reference IDs are deduplicated in first-use order`, () => {
  assert.deepEqual(
    extractPlayerNoteReferenceIds(`@[user:8] #[action:4] @[user:3] #[action:2] #[action:4] @[user:8]`),
    { actionIds: [4, 2], userIds: [8, 3] }
  )
})

test(`malformed and unmatched reference text stays text`, () => {
  const content = `#bad #[action:x] #[action:0] @nobody @[user:-1] #[action:9007199254740992]`

  assert.deepEqual(parsePlayerNoteContent(content), [{ type: `text`, text: content }])
  assert.deepEqual(extractPlayerNoteReferenceIds(content), { actionIds: [], userIds: [] })
})

test(`missing hydrated labels use stable ID fallbacks`, () => {
  assert.equal(formatPlayerNoteText(`#[action:9] @[user:4]`, {}), `#Action 9 @User 4`)
})
