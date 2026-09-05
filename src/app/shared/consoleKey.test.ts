import assert from 'node:assert/strict'
import test from 'node:test'
import { isConsoleKeyCode, recordedConsoleKey } from './consoleKey'

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
