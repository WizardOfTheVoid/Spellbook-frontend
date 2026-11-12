import assert from 'node:assert/strict'
import test from 'node:test'
import { consoleKeyUpdate, defaultKeybinds, keybindConflict, keybindValue } from './keybinds'

test(`keybind values supply missing defaults while preserving an unset Game Server shortcut`, () => {
  assert.equal(keybindValue(null, `gameServerKey`), `F2`)
  assert.equal(keybindValue({}, `gameServerKey`), `F2`)
  assert.equal(keybindValue({ gameServerKey: null }, `gameServerKey`), null)
  assert.equal(keybindValue({ gameServerKey: `F10` }, `gameServerKey`), `F10`)
  assert.equal(keybindValue({ consoleKey: null }, `consoleKey`), null)
})

test(`an unset Game Server shortcut reserves no key but an assigned shortcut conflicts with any other binding`, () => {
  assert.equal(keybindConflict({ ...defaultKeybinds, consoleKey: `F2`, gameServerKey: null }), null)
  assert.ok(keybindConflict({ ...defaultKeybinds, consoleKey: `F2` }))
  assert.ok(keybindConflict({ ...defaultKeybinds, gameServerKey: `F3` }))
})

test(`initial console recording can use F2 by releasing the new default Game Server shortcut`, () => {
  const update = consoleKeyUpdate(defaultKeybinds, `F2`)
  assert.deepEqual(update, { consoleKey: `F2`, gameServerKey: null })
  assert.equal(keybindConflict({ ...defaultKeybinds, ...update }), null)
})

test(`console recording preserves custom and previously configured shortcuts`, () => {
  for (const { settings, key } of [
    { settings: { ...defaultKeybinds, consoleKey: `Minus` as const }, key: `F2` as const },
    { settings: { ...defaultKeybinds, gameServerKey: `F10` as const }, key: `F10` as const }
  ]) {
    const update = consoleKeyUpdate(settings, key)
    assert.equal(update.gameServerKey, settings.gameServerKey)
    assert.ok(keybindConflict({ ...settings, ...update }))
  }
  assert.deepEqual(consoleKeyUpdate(defaultKeybinds, `Minus`), { consoleKey: `Minus`, gameServerKey: `F2` })
})
