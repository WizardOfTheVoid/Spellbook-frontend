import assert from 'node:assert/strict'
import test from 'node:test'
import type { BrowserWindow } from 'electron'
import type { OverlayWindowFactory } from './overlay-window-factory'
import { OverlayWindowController } from './overlay-window-controller'

type WindowFixture = {
  window: BrowserWindow
  hideCalls: () => number
  showCalls: () => number
  emit: (event: string) => void
}

function createWindowFixture(visible = true): WindowFixture {
  let hideCalls = 0
  let showCalls = 0
  const listeners = new Map<string, () => void>()
  const window = {
    setAlwaysOnTop: () => undefined,
    setFocusable: () => undefined,
    setIgnoreMouseEvents: () => undefined,
    setVisibleOnAllWorkspaces: () => undefined,
    setMenuBarVisibility: () => undefined,
    isVisible: () => visible,
    isDestroyed: () => false,
    hide: () => { hideCalls += 1 },
    show: () => { showCalls += 1 },
    on: (event: string, callback: () => void) => listeners.set(event, callback),
    once: (event: string, callback: () => void) => listeners.set(event, callback),
    webContents: {
      on: () => undefined,
      isDestroyed: () => false,
      send: () => undefined
    }
  } as unknown as BrowserWindow

  return {
    window,
    hideCalls: () => hideCalls,
    showCalls: () => showCalls,
    emit: event => {
      const listener = listeners.get(event)
      assert.ok(listener)
      listener()
    }
  }
}

test(`startup shows the overlay after its first frame is ready`, () => {
  const fixture = createWindowFixture(false)
  const controller = createController(fixture)

  controller.showWhenReady()
  assert.equal(fixture.showCalls(), 0)

  fixture.emit(`ready-to-show`)
  assert.equal(fixture.showCalls(), 1)
})

function createController(
  fixture: WindowFixture,
  loadContent: (window: BrowserWindow) => void = () => undefined
): OverlayWindowController {
  const factory = {
    createWindow: () => fixture.window,
    loadContent,
    getTargetDisplayBounds: () => ({ x: 0, y: 0, width: 1920, height: 1080 })
  } as unknown as OverlayWindowFactory

  return new OverlayWindowController(factory, () => undefined)
}

test(`controller owns modal state`, () => {
  const controller = createController(createWindowFixture())

  assert.equal(controller.isModalOpen(), false)
  controller.setModalOpen(true)
  assert.equal(controller.isModalOpen(), true)
  controller.setModalOpen(false)
  assert.equal(controller.isModalOpen(), false)
})

test(`hide clears modal state before hiding the window`, () => {
  const fixture = createWindowFixture()
  const controller = createController(fixture)
  controller.getOrCreate()
  controller.setModalOpen(true)

  controller.hide()

  assert.equal(controller.isModalOpen(), false)
  assert.equal(fixture.hideCalls(), 1)
})

test(`toggle delegates its visible branch through modal-clearing hide`, () => {
  const fixture = createWindowFixture()
  const controller = createController(fixture)
  controller.getOrCreate()
  controller.setModalOpen(true)

  controller.toggle()

  assert.equal(controller.isModalOpen(), false)
  assert.equal(fixture.hideCalls(), 1)
})

test(`closed window cleanup clears modal state and the window reference`, () => {
  const fixture = createWindowFixture()
  const controller = createController(fixture)
  controller.getOrCreate()
  controller.setModalOpen(true)

  fixture.emit(`closed`)

  assert.equal(controller.isModalOpen(), false)
  assert.equal(controller.getCurrent(), null)
})

test(`fresh renderer content starts with cleared modal state`, () => {
  const fixture = createWindowFixture()
  let modalOpenDuringLoad = true
  let controller: OverlayWindowController
  controller = createController(fixture, () => {
    modalOpenDuringLoad = controller.isModalOpen()
  })
  controller.setModalOpen(true)

  controller.getOrCreate()

  assert.equal(modalOpenDuringLoad, false)
})

test(`background state publication never creates an overlay window`, () => {
  const fixture = createWindowFixture()
  let createCalls = 0
  const factory = {
    createWindow: () => {
      createCalls += 1
      return fixture.window
    },
    loadContent: () => undefined,
    getTargetDisplayBounds: () => ({ x: 0, y: 0, width: 1920, height: 1080 })
  } as unknown as OverlayWindowFactory
  const controller = new OverlayWindowController(factory, () => undefined)

  assert.equal(controller.sendToCurrent(`state:changed`, { enabled: true }), false)
  assert.equal(createCalls, 0)
})

test(`background state publication sends only through a live existing window`, () => {
  const fixture = createWindowFixture()
  const sent: unknown[][] = []
  fixture.window.webContents.send = (...args: unknown[]) => { sent.push(args) }
  const controller = createController(fixture)
  controller.getOrCreate()

  assert.equal(controller.sendToCurrent(`state:changed`, { enabled: true }), true)
  assert.deepEqual(sent, [[`state:changed`, { enabled: true }]])
})
