import assert from 'node:assert/strict'
import test from 'node:test'
import { createNavigationHistory } from '$lib/navigation/navigationHistory'
import { visitSnapshotPlayer } from './snapshotPlayerNavigation'

test(`a rejected nested player visit cannot report successful selection`, async () => {
  const history = createNavigationHistory()
  const pending = Promise.withResolvers<void>()
  const other = history.visit(async () => {
    await pending.promise
    return false
  })
  try {
    assert.equal(await visitSnapshotPlayer(history, async () => false), false)
  } finally {
    pending.resolve()
    await other
  }
})

test(`player navigation reports success only for a completed visit that selected the player`, async () => {
  const history = createNavigationHistory()
  let selected = false
  assert.equal(await visitSnapshotPlayer(history, async () => {
    selected = true
    return true
  }), true)
  assert.equal(selected, true)
  assert.equal(await visitSnapshotPlayer(history, async () => {
    history.reset()
    return true
  }), false)
})

test(`a snapshot player visit requests the Actions subpage`, async () => {
  const history = createNavigationHistory()
  let subpage: unknown
  const select = async (requestedSubpage: unknown) => {
    subpage = requestedSubpage
    return true
  }
  assert.equal(await visitSnapshotPlayer(history, select), true)
  assert.equal(subpage, `actions`)
})
