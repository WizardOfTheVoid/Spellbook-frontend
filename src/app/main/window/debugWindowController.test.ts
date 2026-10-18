import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { DebugWindowController } from './debugWindowController'
import type { GameActivitySnapshot } from '../../shared/gameActivity'
import type { DebugSessionSnapshot } from '../../shared/debug'

test(`Debug stays visible behind the overlay and follows its display`, () => {
  let visible = false
  let overlayVisible = true
  let raised = 0
  let bounds = { x: 100, y: 24, width: 340, height: 154 }
  let actualBounds = bounds
  const sent: unknown[] = []
  const window = Object.assign(new EventEmitter(), {
    isDestroyed: () => false, isVisible: () => visible,
    showInactive: () => { visible = true; window.emit(`show`) },
    hide: () => { visible = false },
    setBounds: (value: typeof bounds) => { actualBounds = value },
    webContents: Object.assign(new EventEmitter(), { send: (_channel: string, value: unknown) => sent.push(value) })
  })
  const overlay = Object.assign(new EventEmitter(), {
    isDestroyed: () => false, isVisible: () => overlayVisible, moveTop: () => { raised += 1 }
  })
  const controller = new DebugWindowController({
    createWindow: () => window as unknown as BrowserWindow,
    loadContent: () => undefined, getTargetBounds: () => bounds
  })
  controller.bindOverlay(overlay as unknown as BrowserWindow)
  controller.setEnabled(true)
  assert.equal(visible, true)
  assert.ok(raised > 0)
  overlayVisible = false
  overlay.emit(`hide`)
  assert.equal(visible, true)
  overlayVisible = true
  const previousRaised = raised
  overlay.emit(`show`)
  assert.ok(raised > previousRaised)
  bounds = { ...bounds, x: 2020 }
  overlay.emit(`move`)
  assert.deepEqual(actualBounds, bounds)
  const state: GameActivitySnapshot = { available: true, isMoving: false, isChatting: true,
    timeSinceMovementMs: 2000, timeSinceChattingMs: 2000, chatCooldownRemainingMs: 23000, lastCommand: null, recentCommands: [], isAfk: false,
    gameFocused: true, overlayFocused: false, mouseShowing: false,
    runtime: { enabled: true, gameRunning: true, appRunning: true },
    focus: { gameFocused: true, appFocused: false, gameReady: true, reason: null, overlayState: `unknown` },
    input: { available: true, keyboardActive: false, mouseActive: false, idleMs: 2000,
      isChatting: true, timeSinceChattingMs: 2000, chatCooldownRemainingMs: 23000 },
    execution: { canExecuteCommand: false, reason: `CHAT_ACTIVE` },
    queue: { state: `idle`, pendingActions: 0, id: null, author: null, priority: null,
      cursor: 0, commandCount: 0, remainingMs: null, reason: null, lastResult: null } }
  controller.update(state)
  window.webContents.emit(`did-finish-load`)
  assert.deepEqual(sent.at(-1), state)
  const session = { enabled: true, armed: true } as DebugSessionSnapshot
  controller.updateSession(session)
  window.webContents.emit(`did-finish-load`)
  assert.deepEqual(sent.at(-1), session)
  assert.equal(controller.getCurrent(), window)
  controller.setEnabled(false)
  assert.equal(visible, false)
})
