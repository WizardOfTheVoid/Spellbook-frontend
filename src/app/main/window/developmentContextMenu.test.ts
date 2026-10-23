import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import type { BrowserWindow, ContextMenuParams, Menu, MenuItemConstructorOptions } from 'electron'
import { installDevelopmentContextMenu } from './developmentContextMenu'

function fixture(development = true) {
  const webContents = Object.assign(new EventEmitter(), {
    inspectElement: (x: number, y: number) => { inspected.push([x, y]) },
    copyImageAt: (x: number, y: number) => { copiedImages.push([x, y]) }
  })
  const inspected: number[][] = []
  const copiedImages: number[][] = []
  const copiedText: string[] = []
  const menus: MenuItemConstructorOptions[][] = []
  const popups: unknown[] = []
  const window = Object.assign(new EventEmitter(), { webContents }) as unknown as BrowserWindow
  installDevelopmentContextMenu(window, {
    development,
    copyText: text => { copiedText.push(text) },
    buildMenu: items => {
      menus.push(items)
      return { popup: options => { popups.push(options) } } as Pick<Menu, `popup`>
    }
  })
  const params = {
    x: 45, y: 78, menuSourceType: `mouse`, frame: null,
    isEditable: true, linkURL: `https://example.com/player`, mediaType: `image`, hasImageContents: true,
    editFlags: { canUndo: true, canRedo: false, canCut: false, canCopy: true, canPaste: true, canSelectAll: true }
  } as ContextMenuParams
  const click = (shift = true, button = `right`) => {
    webContents.emit(`before-mouse-event`, {}, { type: `mouseUp`, button, modifiers: shift ? [`shift`] : [] })
    webContents.emit(`context-menu`, {}, params)
  }
  return { webContents, window, params, click, menus, popups, inspected, copiedImages, copiedText }
}

test(`only development Shift right-clicks open a native menu`, () => {
  const state = fixture()
  state.click(false)
  state.click(true, `left`)
  assert.equal(state.menus.length, 0)
  state.click()
  assert.equal(state.menus.length, 1)
  assert.deepEqual(state.popups, [{ window: state.window, x: 45, y: 78, sourceType: `mouse` }])
  state.webContents.emit(`context-menu`, {}, state.params)
  assert.equal(state.menus.length, 1)

  const production = fixture(false)
  production.click()
  assert.equal(production.menus.length, 0)
})

test(`native menu uses context editing permissions and targets inspect and clipboard actions`, () => {
  const state = fixture()
  state.click()
  const items = state.menus[0]
  assert.equal(items.find(item => item.role === `cut`)?.enabled, false)
  assert.equal(items.find(item => item.role === `copy`)?.enabled, true)
  assert.equal(items.find(item => item.role === `paste`)?.enabled, true)
  for (const item of items) item.click?.(null as never, state.window, {} as never)
  assert.deepEqual(state.inspected, [[45, 78]])
  assert.deepEqual(state.copiedImages, [[45, 78]])
  assert.deepEqual(state.copiedText, [state.params.linkURL])
})

test(`Windows mouse events without modifiers use the current Shift key state and clear it on blur`, () => {
  const state = fixture()
  const click = () => {
    state.webContents.emit(`before-mouse-event`, {}, { type: `mouseUp`, button: `right` })
    state.webContents.emit(`context-menu`, {}, state.params)
  }
  state.webContents.emit(`before-input-event`, {}, { type: `keyDown`, key: `Shift`, shift: true })
  click()
  assert.equal(state.menus.length, 1)
  state.webContents.emit(`before-input-event`, {}, { type: `keyUp`, key: `Shift`, shift: false })
  click()
  assert.equal(state.menus.length, 1)
  state.webContents.emit(`before-input-event`, {}, { type: `keyDown`, key: `Shift`, shift: true })
  state.window.emit(`blur`)
  click()
  assert.equal(state.menus.length, 1)
})
