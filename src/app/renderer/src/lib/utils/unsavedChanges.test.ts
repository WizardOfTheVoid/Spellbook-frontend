import assert from 'node:assert/strict'
import test from 'node:test'
import { createUnsavedChangesGuard } from './unsavedChanges'

test(`clean or saved forms leave without a prompt`, async () => {
  let prompts = 0
  let dirty = false
  const guard = createUnsavedChangesGuard(async () => {
    prompts++
    return false
  })
  guard.register(() => dirty)
  assert.equal(await guard.canLeave(), true)
  dirty = true
  assert.equal(await guard.canLeave(), false)
  dirty = false
  assert.equal(await guard.canLeave(), true)
  assert.equal(prompts, 1)
})

test(`cancel keeps edits and confirmation allows leaving`, async () => {
  let discard = false
  const guard = createUnsavedChangesGuard(async () => discard)
  const unregister = guard.register(() => true)
  assert.equal(await guard.canLeave(), false)
  discard = true
  assert.equal(await guard.canLeave(), true)
  unregister()
  discard = false
  assert.equal(await guard.canLeave(), true)
})

test(`a second navigation cannot replace the pending discard decision`, async () => {
  let resolveDecision: (discard: boolean) => void = () => {}
  const guard = createUnsavedChangesGuard(() => new Promise<boolean>(resolve => { resolveDecision = resolve }))
  guard.register(() => true)
  const first = guard.canLeave()
  assert.equal(await guard.canLeave(), false)
  resolveDecision(true)
  assert.equal(await first, true)
})

test(`unmounting the edited form invalidates the pending navigation`, async () => {
  let resolveDecision: (discard: boolean) => void = () => {}
  const guard = createUnsavedChangesGuard(() => new Promise<boolean>(resolve => { resolveDecision = resolve }))
  const unregister = guard.register(() => true)
  const pending = guard.canLeave()
  unregister()
  resolveDecision(true)
  assert.equal(await pending, false)
})
