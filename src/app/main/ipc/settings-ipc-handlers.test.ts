import assert from 'node:assert/strict'
import test from 'node:test'
import type { IpcMain } from 'electron'
import type { HttpClient } from '../api/http-client'
import type { AppSettingsService } from '../services/app-settings-service'
import type { OverlayWindowController } from '../window/overlay-window-controller'
import { SettingsIpcHandlers } from './settings-ipc-handlers'

test(`console binds stay local when server preferences are read or saved`, async () => {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>()
  const settings = { audioSfxEnabled: true, audioSfxVolume: 0.5, selectedDisplayId: 7, consoleKey: `Backquote` }
  const synced: unknown[] = []
  new SettingsIpcHandlers(
    { handle: (channel: string, handler: (...args: unknown[]) => Promise<unknown>) => handlers.set(channel, handler) } as unknown as IpcMain,
    {
      getSettings: () => ({ ...settings }),
      updateSettings: async (update: object) => Object.assign(settings, update),
      getSnapshot: () => ({ settings: { ...settings }, displays: [], effectiveDisplayId: 7 })
    } as unknown as AppSettingsService,
    {} as OverlayWindowController,
    {
      getServer: async () => ({ ok: true, data: { data: { audioSfxEnabled: false, consoleKey: `F6` } } }),
      patchServer: async (_path: string, body: unknown) => synced.push(body)
    } as unknown as HttpClient
  ).register()

  await handlers.get(`settings:get`)?.()
  assert.equal(settings.audioSfxEnabled, false)
  assert.equal(settings.consoleKey, `Backquote`)
  await handlers.get(`settings:update`)?.(null, { consoleKey: `Minus` })
  assert.equal(settings.consoleKey, `Minus`)
  assert.deepEqual(synced, [])
  await handlers.get(`settings:update`)?.(null, { audioSfxVolume: 0.25 })
  assert.deepEqual(synced, [{ settings: { audioSfxEnabled: false, audioSfxVolume: 0.25, selectedDisplayId: 7 } }])
})
