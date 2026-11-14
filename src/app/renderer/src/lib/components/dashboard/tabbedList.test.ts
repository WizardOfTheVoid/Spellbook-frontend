import assert from 'node:assert/strict'
import test from 'node:test'
import { nextTabbedListIndex } from './tabbedList'

test(`moves tab focus with wrapping arrows and boundary keys`, () => {
  assert.equal(nextTabbedListIndex(`ArrowRight`, 2, 3), 0)
  assert.equal(nextTabbedListIndex(`ArrowLeft`, 0, 3), 2)
  assert.equal(nextTabbedListIndex(`Home`, 2, 3), 0)
  assert.equal(nextTabbedListIndex(`End`, 0, 3), 2)
  assert.equal(nextTabbedListIndex(`Enter`, 1, 3), null)
  assert.equal(nextTabbedListIndex(`ArrowRight`, 0, 0), null)
})
