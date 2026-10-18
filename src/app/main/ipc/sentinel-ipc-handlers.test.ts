import assert from 'node:assert/strict'
import test from 'node:test'
import type { IpcMain } from 'electron'
import type { SentinelService, SentinelState } from '../services/sentinelService'
import type { OverlayWindowController } from '../window/overlay-window-controller'
import { SentinelIpcHandlers } from './sentinel-ipc-handlers'

type Handler = (...args: unknown[]) => unknown

function createFixture() {
  const handlers = new Map<string, Handler>()
  const setCalls: boolean[] = []
  const sent: unknown[][] = []
  let state: SentinelState = Object.freeze({ enabled: false })
  let listener: ((next: SentinelState) => void) | null = null

  const sentinel = {
    getState: () => state,
    setEnabled: async (enabled: boolean) => {
      setCalls.push(enabled)
      state = Object.freeze({ enabled })
      listener?.(state)
      return state
    },
    subscribe: (next: (value: SentinelState) => void) => {
      listener = next
      return () => { listener = null }
    }
  } as unknown as SentinelService

  new SentinelIpcHandlers(
    { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) } as unknown as IpcMain,
    sentinel,
    { sendToCurrent: (...args: unknown[]) => { sent.push(args); return true } } as unknown as OverlayWindowController
  ).register()

  return { handlers, setCalls, sent }
}

test(`Sentinel IPC hydrates current Main state`, () => {
  const { handlers } = createFixture()

  assert.deepEqual(handlers.get(`core:sentinelState`)?.(), { enabled: false })
})

test(`Sentinel IPC validates the enabled payload before changing Main state`, async () => {
  const { handlers, setCalls } = createFixture()
  const setEnabled = handlers.get(`core:setSentinelEnabled`)
  assert.ok(setEnabled)

  await assert.rejects(() => setEnabled({}, { enabled: `true` }) as Promise<unknown>, {
    name: `TypeError`,
    message: `Sentinel enabled must be a boolean.`
  })
  assert.deepEqual(setCalls, [])
})

test(`Sentinel IPC publishes Main changes only through the current overlay`, async () => {
  const { handlers, sent } = createFixture()
  const setEnabled = handlers.get(`core:setSentinelEnabled`)
  assert.ok(setEnabled)

  assert.deepEqual(await setEnabled({}, { enabled: true }), { enabled: true })
  assert.deepEqual(sent, [[`core:sentinelStateChanged`, { enabled: true }]])
})
