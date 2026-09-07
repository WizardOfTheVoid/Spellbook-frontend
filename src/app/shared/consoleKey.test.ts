import assert from 'node:assert/strict'
import test from 'node:test'
import { ConsoleBindController } from '../renderer/src/lib/components/settings/consoleBindController'
import { isConsoleKeyCode, recordedConsoleKey } from './consoleKey'

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

test(`records the physical key code without accepting modifiers or reserved keys`, () => {
  const event = { code: `Backquote`, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, repeat: false, isComposing: false }
  assert.equal(recordedConsoleKey(event), `Backquote`)
  for (const modifier of [`ctrlKey`, `altKey`, `shiftKey`, `metaKey`, `repeat`, `isComposing`]) {
    assert.equal(recordedConsoleKey({ ...event, [modifier]: true }), null)
  }
  for (const code of [`Enter`, `Escape`, `F3`, `F4`, `F12`, `ShiftLeft`, `ControlLeft`, `MetaLeft`, `Unidentified`, `__proto__`, `toString`, `KeyA,KeyB`]) {
    assert.equal(isConsoleKeyCode(code), false, code)
  }
  assert.equal(recordedConsoleKey({ ...event, code: `NumpadSubtract` }), `NumpadSubtract`)
  assert.equal(isConsoleKeyCode(74), false)
})

test(`failed console key loading releases busy state and can retry`, async () => {
  const first = deferred<boolean>()
  let attempt = 0
  const controller = new ConsoleBindController({
    load: async () => attempt++ === 0 ? await first.promise : true,
    save: async () => true
  })

  const loading = controller.load()
  assert.equal(controller.state.busy, true)
  first.resolve(false)
  await loading
  assert.equal(controller.state.busy, false)
  assert.equal(controller.state.retry, `load`)

  await controller.retry()
  assert.equal(controller.state.retry, null)
  assert.equal(controller.state.message, ``)
})

test(`failed console key saving can retry the captured key without recording again`, async () => {
  const saved: unknown[] = []
  let succeeds = false
  const controller = new ConsoleBindController({
    load: async () => true,
    save: async (consoleKey: unknown) => {
      saved.push(consoleKey)
      return succeeds
    }
  })

  controller.startRecording()
  assert.equal(controller.state.busy, true)
  const saving = controller.save(`Backquote`)
  assert.equal(controller.state.recording, false)
  assert.equal(controller.state.saving, true)
  await saving
  assert.equal(controller.state.busy, false)
  assert.equal(controller.state.retry, `save`)

  succeeds = true
  await controller.retry()
  assert.deepEqual(saved, [`Backquote`, `Backquote`])
  assert.equal(controller.state.retry, null)
})

test(`cancelling console key recording releases busy state`, () => {
  const controller = new ConsoleBindController({
    load: async () => true,
    save: async () => true
  })

  controller.startRecording()
  controller.cancelRecording()

  assert.equal(controller.state.recording, false)
  assert.equal(controller.state.busy, false)
})

test(`unsupported console keys keep the recorder active for another key`, () => {
  const controller = new ConsoleBindController({
    load: async () => true,
    save: async () => true
  })

  controller.startRecording()
  controller.rejectKey()

  assert.equal(controller.state.recording, true)
  assert.equal(controller.state.busy, true)
  assert.match(controller.state.message, /one key without modifiers/i)
})

test(`destroyed console key state ignores a late settings response`, async () => {
  const pending = deferred<boolean>()
  const changes: unknown[] = []
  const controller = new ConsoleBindController({
    load: async () => pending.promise,
    save: async () => true
  }, (state: unknown) => changes.push(state))
  const loading = controller.load()

  controller.destroy()
  const changesAfterDestroy = changes.length
  assert.equal(controller.state.busy, false)
  pending.resolve(true)
  await loading

  assert.equal(changes.length, changesAfterDestroy)
})
