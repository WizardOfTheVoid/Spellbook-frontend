import assert from 'node:assert/strict'
import test from 'node:test'
import type { BrowserWindow } from 'electron'
import { OverlayWindowEventBinder } from './overlay-window-event-binder'

type InputEvent = {
  preventDefault: () => void
}

type Input = {
  type: string
  key: string
}

type WindowFixture = {
  window: BrowserWindow
  beforeInput: (event: InputEvent, input: Input) => void
  finishLoad: () => void
}

function createWindowFixture(): WindowFixture {
  let beforeInput: WindowFixture['beforeInput'] | undefined
  let finishLoad: WindowFixture['finishLoad'] | undefined
  const window = {
    setAlwaysOnTop: () => undefined,
    setFocusable: () => undefined,
    setIgnoreMouseEvents: () => undefined,
    setVisibleOnAllWorkspaces: () => undefined,
    setMenuBarVisibility: () => undefined,
    isVisible: () => true,
    on: () => undefined,
    webContents: {
      on: (event: string, callback: WindowFixture['beforeInput'] | WindowFixture['finishLoad']) => {
        if (event === `before-input-event`) beforeInput = callback as WindowFixture['beforeInput']
        if (event === `did-finish-load`) finishLoad = callback as WindowFixture['finishLoad']
      },
      isDestroyed: () => false,
      send: () => undefined
    }
  } as unknown as BrowserWindow

  return {
    window,
    beforeInput: (event, input) => {
      assert.ok(beforeInput)
      beforeInput(event, input)
    },
    finishLoad: () => {
      assert.ok(finishLoad)
      finishLoad()
    }
  }
}

for (const modalOpen of [false, true]) {
  test(`Escape ${modalOpen ? `stays in an open modal` : `hides the overlay without a modal`}`, () => {
    let hideCalls = 0
    let prevented = false
    const binder = new OverlayWindowEventBinder({
      hide: () => { hideCalls += 1 },
      toggleDevTools: () => undefined,
      clearWindow: () => undefined,
      requestFocusRefresh: () => undefined,
      isModalOpen: () => modalOpen,
      clearModalState: () => undefined
    })
    const fixture = createWindowFixture()
    binder.bind(fixture.window)

    fixture.beforeInput({ preventDefault: () => { prevented = true } }, { type: `keyDown`, key: `Escape` })

    assert.equal(prevented, modalOpen === false)
    assert.equal(hideCalls, modalOpen ? 0 : 1)
  })
}

test(`non-Escape input remains untouched`, () => {
  let hideCalls = 0
  let prevented = false
  const binder = new OverlayWindowEventBinder({
    hide: () => { hideCalls += 1 },
    toggleDevTools: () => undefined,
    clearWindow: () => undefined,
    requestFocusRefresh: () => undefined,
    isModalOpen: () => false,
    clearModalState: () => undefined
  })
  const fixture = createWindowFixture()
  binder.bind(fixture.window)

  fixture.beforeInput({ preventDefault: () => { prevented = true } }, { type: `keyDown`, key: `Enter` })

  assert.equal(prevented, false)
  assert.equal(hideCalls, 0)
})

test(`fresh renderer load clears stale modal state`, () => {
  let clearCalls = 0
  const binder = new OverlayWindowEventBinder({
    hide: () => undefined,
    toggleDevTools: () => undefined,
    clearWindow: () => undefined,
    requestFocusRefresh: () => undefined,
    isModalOpen: () => false,
    clearModalState: () => { clearCalls += 1 }
  })
  const fixture = createWindowFixture()
  binder.bind(fixture.window)

  fixture.finishLoad()

  assert.equal(clearCalls, 1)
})
