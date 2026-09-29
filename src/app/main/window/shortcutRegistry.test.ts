import assert from 'node:assert/strict'
import test from 'node:test'
import { ShortcutRegistry } from './shortcut-registry'
import { defaultKeybinds } from '../../shared/keybinds'

function fixture() {
  const registered = new Map<string, () => void>()
  const attempted: string[] = []
  let unavailable = ``
  let suspended = false
  const calls: string[] = []
  const registry = new ShortcutRegistry({ toggle: () => { calls.push(`overlay`) } }, () => { calls.push(`player`) }, {
    toggle: () => { calls.push(`debug`) },
    toggleHud: () => { calls.push(`hud`) }
  }, {
    register: (key, callback) => {
      attempted.push(key)
      if (key === unavailable || suspended) return false
      registered.set(key, callback)
      return true
    },
    unregister: key => { registered.delete(key) },
    unregisterAll: () => registered.clear(),
    setSuspended: value => { suspended = value }
  })
  return { registry, registered, attempted, calls, block: (key: string) => { unavailable = key }, suspended: () => suspended }
}

test(`changing and swapping shortcuts updates callbacks and releases old keys`, () => {
  const { registry, registered, calls } = fixture()
  registry.register()
  registered.get(`F3`)?.()
  registered.get(`F4`)?.()
  registry.apply({ ...defaultKeybinds, overlayKey: `F4`, quickOpenPlayerKey: `F3` })
  registered.get(`F4`)?.()
  registered.get(`F3`)?.()
  registry.apply({ ...defaultKeybinds, overlayKey: `F8`, quickOpenPlayerKey: `F7` })
  assert.equal(registered.has(`F3`), false)
  assert.equal(registered.has(`F4`), false)
  registered.get(`F8`)?.()
  assert.deepEqual(calls, [`overlay`, `player`, `overlay`, `player`, `overlay`])
})

test(`registration failure preserves the previous shortcuts and removes partial replacements`, () => {
  const { registry, registered, block, calls } = fixture()
  registry.register()
  block(`F7`)
  assert.throws(() => registry.apply({ ...defaultKeybinds, overlayKey: `F8`, quickOpenPlayerKey: `F7` }), /Could not register/u)
  assert.equal(registered.has(`F8`), false)
  registered.get(`F3`)?.()
  registered.get(`F4`)?.()
  assert.deepEqual(calls, [`overlay`, `player`])
})

test(`recording suspends shortcuts and saving or shutdown resumes them`, () => {
  const { registry, suspended, registered } = fixture()
  registry.register()
  registry.setRecording(true)
  assert.equal(suspended(), true)
  registry.apply({ ...defaultKeybinds, overlayKey: `F8` })
  assert.equal(suspended(), false)
  assert.equal(registered.has(`F8`), true)
  registry.setRecording(true)
  registry.unregisterAll()
  assert.equal(suspended(), false)
  assert.equal(registered.size, 0)
})

test(`startup and settings changes never register F12 globally`, () => {
  const { registry, block, registered, attempted } = fixture()
  block(`F12`)
  assert.doesNotThrow(() => registry.register())
  assert.equal(registered.has(`F3`), true)
  assert.equal(registered.has(`F4`), true)
  registry.apply({ ...defaultKeybinds, overlayKey: `F8` })
  assert.equal(attempted.includes(`F12`), false)
})

test(`one unavailable startup shortcut does not disable the other shortcuts`, () => {
  const { registry, block, registered } = fixture()
  block(`F4`)
  assert.doesNotThrow(() => registry.register())
  assert.equal(registered.has(`F3`), true)
  assert.equal(registered.has(`F12`), false)
})

test(`Ctrl+F5 and F6 toggle Debug and HUD across configurable shortcut changes`, () => {
  const { registry, registered, calls } = fixture()
  registry.register()
  assert.equal(registered.has(`F5`), false)
  assert.equal(registered.has(`Control+F6`), false)
  registered.get(`Control+F5`)?.()
  registered.get(`F6`)?.()
  registry.apply({ ...defaultKeybinds, overlayKey: `F8` })
  registered.get(`Control+F5`)?.()
  registered.get(`F6`)?.()
  assert.deepEqual(calls, [`debug`, `hud`, `debug`, `hud`])
  registry.unregisterAll()
  assert.equal(registered.size, 0)
})
