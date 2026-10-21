import assert from 'node:assert/strict'
import test from 'node:test'
import type { OverlayWindowController } from '../window/overlay-window-controller'
import { OverlayActivityGuard } from './overlay-activity-guard'

function createGuard(isForegroundInteractive: () => boolean = () => true): OverlayActivityGuard {
  const overlayWindow = {
    isForegroundInteractive
  } as OverlayWindowController

  return new OverlayActivityGuard(overlayWindow)
}

test('reserves one game command batch and blocks all other game commands', () => {
  let overlayForeground = true
  const guard = createGuard(() => overlayForeground)

  assert.equal(guard.beginGameCommandBatch(), null)
  assert.equal(guard.isGameCommandBatchActive(), true)

  overlayForeground = false
  assert.equal(guard.getInactiveGameCommandResult()?.error?.code, 'COMMAND_BATCH_ACTIVE')

  overlayForeground = true
  assert.equal(guard.beginGameCommandBatch()?.error?.code, 'COMMAND_BATCH_ACTIVE')

  guard.endGameCommandBatch()

  assert.equal(guard.isGameCommandBatchActive(), false)
  assert.equal(guard.getInactiveGameCommandResult(), null)
})

test('requires a foreground-interactive overlay before reserving a batch', () => {
  const guard = createGuard(() => false)

  assert.equal(guard.beginGameCommandBatch()?.error?.code, 'OVERLAY_INACTIVE')
  assert.equal(guard.isGameCommandBatchActive(), false)
})

test(`blocks game input while an editable control is focused`, () => {
  const guard = createGuard()

  guard.setTextInputActive(true)

  assert.equal(guard.getInactiveGameCommandResult()?.error?.code, `TEXT_INPUT_ACTIVE`)
  assert.equal(guard.beginGameCommandBatch()?.error?.code, `TEXT_INPUT_ACTIVE`)
  assert.equal(guard.isGameCommandBatchActive(), false)

  guard.setTextInputActive(false)

  assert.equal(guard.getInactiveGameCommandResult(), null)
})
