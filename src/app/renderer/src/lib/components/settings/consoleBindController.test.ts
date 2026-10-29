import assert from 'node:assert/strict'
import test from 'node:test'
import { ConsoleBindController } from './consoleBindController'

test(`saving a captured key reports success after the recorder stops being busy`, async () => {
  const controller = new ConsoleBindController({ load: async () => true, save: async () => true })
  controller.startRecording()

  assert.equal(await controller.save(`F7`), true)
  assert.equal(controller.state.busy, false)
  assert.equal(controller.state.recording, false)
  assert.equal(controller.state.saved, true)
  controller.startRecording()
  assert.equal(controller.state.saved, false)
})

test(`failed or inactive saves do not report success`, async () => {
  const controller = new ConsoleBindController({ load: async () => true, save: async () => false })
  controller.startRecording()
  assert.equal(await controller.save(`F7`), false)
  assert.equal(controller.state.retry, `save`)
  assert.equal(controller.state.saved, false)

  controller.destroy()
  assert.equal(await controller.save(`F7`), false)
})
