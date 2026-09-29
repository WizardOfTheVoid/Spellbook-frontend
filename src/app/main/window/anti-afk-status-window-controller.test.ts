import assert from 'node:assert/strict'
import test from 'node:test'
import type { BrowserWindow } from 'electron'
import { AntiAfkStatusWindowController } from './anti-afk-status-window-controller'
import type { AntiAfkStatusWindowFactory } from './anti-afk-status-window-factory'

test('show positions the permanent indicator at the selected display corner without focus', () => {
  const events: string[] = []
  const bounds = { x: 24, y: 24, width: 300, height: 64 }
  const window = {
    isDestroyed: () => false,
    isVisible: () => false,
    setBounds: (value: Electron.Rectangle) => {
      assert.deepEqual(value, bounds)
      events.push('bounds')
    },
    showInactive: () => events.push('showInactive'),
    setAlwaysOnTop: () => events.push('alwaysOnTop'),
    hide: () => events.push('hide'),
    on: () => undefined
  } as unknown as BrowserWindow
  const factory = {
    createWindow: () => window,
    loadContent: () => events.push('load'),
    getTargetBounds: () => bounds
  } as unknown as AntiAfkStatusWindowFactory
  const controller = new AntiAfkStatusWindowController(factory)

  controller.show()

  assert.deepEqual(events, ['load', 'bounds', 'showInactive', 'alwaysOnTop'])
})

test('hide removes a visible indicator without creating its window', () => {
  let createCalls = 0
  let hideCalls = 0
  const window = {
    isDestroyed: () => false,
    isVisible: () => true,
    setBounds: () => undefined,
    showInactive: () => undefined,
    setAlwaysOnTop: () => undefined,
    hide: () => { hideCalls += 1 },
    on: () => undefined
  } as unknown as BrowserWindow
  const factory = {
    createWindow: () => {
      createCalls += 1
      return window
    },
    loadContent: () => undefined,
    getTargetBounds: () => ({ x: 24, y: 24, width: 300, height: 64 })
  } as unknown as AntiAfkStatusWindowFactory
  const controller = new AntiAfkStatusWindowController(factory)

  controller.hide()
  controller.show()
  controller.hide()

  assert.equal(createCalls, 1)
  assert.equal(hideCalls, 1)
})
