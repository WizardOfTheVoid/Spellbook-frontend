import assert from 'node:assert/strict'
import test from 'node:test'
import type { IpcMain } from 'electron'
import type { FocusMonitor } from '../focus/focus-monitor'
import type { OverlayActivityGuard } from '../services/overlay-activity-guard'
import type { OverlayWindowController } from '../window/overlay-window-controller'
import type { ToastWindowController } from '../window/toast-window-controller'
import { OverlayIpcHandlers } from './overlay-ipc-handlers'

type Handler = (_event: unknown, value?: unknown) => unknown

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
    {} as never,
  ).register()
  const setModalOpen = handlers.get(`overlay:setModalOpen`)
  assert.ok(setModalOpen)

  setModalOpen({}, true)
  setModalOpen({}, false)
  setModalOpen({}, `true`)

  assert.deepEqual(modalStates, [true, false, false])
})

test(`editable-focus IPC accepts only literal true as active`, () => {
  const events = new Map<string, Handler>()
  const textInputStates: boolean[] = []
  new OverlayIpcHandlers(
    {
      handle: () => undefined,
      on: (channel: string, handler: Handler) => events.set(channel, handler)
    } as unknown as IpcMain,
    {} as OverlayWindowController,
    {} as FocusMonitor,
    {} as ToastWindowController,
    {
      setTextInputActive: (active: boolean) => { textInputStates.push(active) }
    } as unknown as OverlayActivityGuard,
    12_000,
    {} as never,
  ).register()

  events.get(`overlay:textInputActive`)?.({}, true)
  events.get(`overlay:textInputActive`)?.({}, false)
  events.get(`overlay:textInputActive`)?.({}, `true`)

  assert.deepEqual(textInputStates, [true, false, false])
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
    {} as never,
  ).register()

  assert.equal(handlers.get('overlay:notificationPollMs')?.({}), 12_000)
})

test(`update IPC checks the release and opens its fixed page`, async () => {
  const handlers = new Map<string, Handler>()
  const calls: string[] = []
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
    {
      check: async () => { calls.push(`check`); return `1.0.11` },
      openLatestRelease: async () => { calls.push(`open`) }
    }
  ).register()

  assert.equal(await handlers.get(`app:update:check`)?.({}), `1.0.11`)
  await handlers.get(`app:update:open`)?.({})
  assert.deepEqual(calls, [`check`, `open`])
})
