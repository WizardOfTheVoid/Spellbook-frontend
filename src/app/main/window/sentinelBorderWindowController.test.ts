import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import type { BrowserWindow } from 'electron'
import { SentinelBorderWindowController } from './sentinelBorderWindowController'

function createFixture() {
  const events: string[] = []
  let visible = false
  let overlayVisible = true
  let bounds = { x: 0, y: 0, width: 1920, height: 1080 }
  let currentBounds = bounds
  const border = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    isVisible: () => visible,
    setBounds: (value: Electron.Rectangle) => { currentBounds = value },
    showInactive: () => {
      visible = true
      events.push(`border:showInactive`)
      border.emit(`show`)
    },
    hide: () => { visible = false }
  })
  const overlay = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    isVisible: () => overlayVisible,
    moveTop: () => events.push(`overlay:moveTop`)
  })
  const controller = new SentinelBorderWindowController({
    createWindow: () => {
      events.push(`create`)
      return border as unknown as BrowserWindow
    },
    loadContent: () => undefined,
    getTargetBounds: () => bounds
  })
  controller.bindOverlay(overlay as unknown as BrowserWindow)

  return {
    controller, events, border, overlay,
    visible: () => visible,
    bounds: () => currentBounds,
    moveDisplay: () => {
      bounds = { x: 1920, y: 0, width: 2560, height: 1440 }
      overlay.emit(`move`)
      return bounds
    },
    hideOverlay: () => {
      overlayVisible = false
      overlay.emit(`hide`)
    },
    showOverlay: () => {
      overlayVisible = true
      overlay.emit(`show`)
    }
  }
}

test(`Sentinel border stays visible when the overlay hides and stays below it when reopened`, () => {
  const fixture = createFixture()
  fixture.controller.setEnabled(true)
  assert.equal(fixture.visible(), true)
  assert.deepEqual(fixture.events.slice(-2), [`border:showInactive`, `overlay:moveTop`])

  fixture.hideOverlay()
  assert.equal(fixture.visible(), true)
  fixture.showOverlay()
  assert.equal(fixture.events.at(-1), `overlay:moveTop`)
  assert.equal(fixture.visible(), true)

  fixture.controller.setEnabled(false)
  assert.equal(fixture.visible(), false)
})

test(`enabling Sentinel with a hidden overlay never shows or raises the overlay`, () => {
  const fixture = createFixture()
  fixture.hideOverlay()
  fixture.controller.setEnabled(true)
  assert.equal(fixture.visible(), true)
  assert.ok(!fixture.events.includes(`overlay:moveTop`))
})

test(`disabled Sentinel creates no window and repeated enables reuse the border`, () => {
  const fixture = createFixture()
  fixture.controller.setEnabled(false)
  assert.deepEqual(fixture.events, [])
  fixture.controller.setEnabled(true)
  fixture.controller.setEnabled(true)
  fixture.controller.setEnabled(false)
  fixture.controller.setEnabled(true)
  assert.equal(fixture.events.filter(event => event === `create`).length, 1)
})

test(`the active border follows the selected display without hiding`, () => {
  const fixture = createFixture()
  fixture.controller.setEnabled(true)
  const expectedBounds = fixture.moveDisplay()
  assert.deepEqual(fixture.bounds(), expectedBounds)
  assert.equal(fixture.visible(), true)
  assert.equal(fixture.events.at(-1), `overlay:moveTop`)
})
