import assert from 'node:assert/strict'
import test from 'node:test'
import { AppLinkInbox } from './appLinkInbox'

test(`player links stay pending across renderer startup and reload until acknowledged`, () => {
  const inbox = new AppLinkInbox()
  assert.equal(inbox.accept(`spellbook://players/ABC_123`), true)
  const first = inbox.pending()!
  assert.deepEqual(inbox.pending(), first)
  assert.equal(inbox.accept(`spellbook://players/DEF_456`), true)
  assert.equal(inbox.acknowledge(first.sequence), false)
  assert.equal(inbox.pending()?.playfabId, `DEF_456`)
  assert.equal(inbox.pending()?.sequence, first.sequence + 1)
  assert.equal(inbox.accept(`spellbook://unknown/ABC_123`), false)
  assert.equal(inbox.pending()?.playfabId, `DEF_456`)
  assert.equal(inbox.acknowledge(inbox.pending()!.sequence), true)
  assert.equal(inbox.pending(), null)
})

test(`listeners see new links but do not consume them`, () => {
  const inbox = new AppLinkInbox()
  let changes = 0
  const stop = inbox.subscribe(() => { changes += 1 })
  inbox.accept(`spellbook://players/ABC_123`)
  assert.equal(changes, 1)
  assert.equal(inbox.pending()?.playfabId, `ABC_123`)
  stop()
  inbox.accept(`spellbook://players/DEF_456`)
  assert.equal(changes, 1)
})
