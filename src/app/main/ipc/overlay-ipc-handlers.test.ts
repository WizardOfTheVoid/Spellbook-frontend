import assert from 'node:assert/strict'
import test from 'node:test'
import type { IpcMain } from 'electron'
import type { FocusMonitor } from '../focus/focus-monitor'
import type { OverlayActivityGuard } from '../services/overlay-activity-guard'
import type { OverlayWindowController } from '../window/overlay-window-controller'
import type { ToastWindowController } from '../window/toast-window-controller'
import { OverlayIpcHandlers } from './overlay-ipc-handlers'

type Handler = (_event: unknown, value?: unknown) => unknown

test(`toast actions open the app and return to the renderer that published them`, async () => {
  const handlers = new Map<string, Handler>()
  const sent: unknown[][] = []
  let onAction: (() => void) | undefined
  let opened = 0
  let destroyed = false
  new OverlayIpcHandlers(
    {
      handle: (channel: string, handler: Handler) => handlers.set(channel, handler),
      on: () => undefined,
    } as unknown as IpcMain,
    { show: () => { opened += 1 } } as unknown as OverlayWindowController,
    {} as FocusMonitor,
    { show: async (_request: unknown, callback: () => void) => { onAction = callback; return true } } as unknown as ToastWindowController,
    {} as OverlayActivityGuard,
    12_000,
  ).register()
  const sender = { isDestroyed: () => destroyed, send: (...args: unknown[]) => sent.push(args) }
  assert.equal(await handlers.get(`toast:show`)?.({ sender }, { message: `Hello`, level: `info`, actionId: 4 }), true)
  onAction?.()
  assert.equal(opened, 1)
  assert.deepEqual(sent, [[`toast:action`, 4]])
  destroyed = true
  onAction?.()
  assert.equal(opened, 1)
  assert.equal(sent.length, 1)
})

test(`modal IPC accepts only literal true as open`, () => {
  const handlers = new Map<string, Handler>()
  const modalStates: boolean[] = []
  new OverlayIpcHandlers(
    {
      handle: (channel: string, handler: Handler) => handlers.set(channel, handler),
      on: () => undefined
    } as unknown as IpcMain,
    {
      setModalOpen: (open: boolean) => { modalStates.push(open) }
    } as OverlayWindowController,
    {} as FocusMonitor,
    {} as ToastWindowController,
    {} as OverlayActivityGuard,
    12_000,
  ).register()
  const setModalOpen = handlers.get(`overlay:setModalOpen`)
  assert.ok(setModalOpen)

  setModalOpen({}, true)
  setModalOpen({}, false)
  setModalOpen({}, `true`)

  assert.deepEqual(modalStates, [true, false, false])
})

test(`editable-focus IPC requires the current overlay and a literal boolean`, () => {
  const events = new Map<string, Handler>()
  const textInputStates: boolean[] = []
  const sender = {}
  new OverlayIpcHandlers(
    {
      handle: () => undefined,
      on: (channel: string, handler: Handler) => events.set(channel, handler)
    } as unknown as IpcMain,
    { getCurrent: () => ({ webContents: sender }) } as OverlayWindowController,
    {} as FocusMonitor,
    {} as ToastWindowController,
    {
      setTextInputActive: (active: boolean) => { textInputStates.push(active) }
    } as unknown as OverlayActivityGuard,
    12_000,
  ).register()

  events.get(`overlay:textInputActive`)?.({ sender }, true)
  events.get(`overlay:textInputActive`)?.({ sender }, `false`)
  events.get(`overlay:textInputActive`)?.({ sender: {} }, false)
  events.get(`overlay:textInputActive`)?.({ sender }, null)
  assert.deepEqual(textInputStates, [true])
  events.get(`overlay:textInputActive`)?.({ sender }, false)

  assert.deepEqual(textInputStates, [true, false])
})

test('notification poll IPC returns the configured milliseconds', () => {
  const handlers = new Map<string, Handler>()
  new OverlayIpcHandlers(
    {
      handle: (channel: string, handler: Handler) => handlers.set(channel, handler),
      on: () => undefined
    } as unknown as IpcMain,
    {} as OverlayWindowController,
    {} as FocusMonitor,
    {} as ToastWindowController,
    {} as OverlayActivityGuard,
    12_000,
  ).register()

  assert.equal(handlers.get('overlay:notificationPollMs')?.({}), 12_000)
})
