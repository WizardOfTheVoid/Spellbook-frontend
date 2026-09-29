import assert from 'node:assert/strict'
import test from 'node:test'
import type { IpcMainInvokeEvent } from 'electron'
import { ConsoleSetupIpc } from './consoleSetupIpc'
import { ConsoleSetupService } from './consoleSetupService'
import type { OverlayWindowController } from '../window/overlay-window-controller'

test(`only the main app frame can enable the game console through IPC`, async () => {
  const calls: string[] = []
  const service = new ConsoleSetupService({ callCore: async (path, init) => {
    calls.push(`${init?.method} ${path}`)
    return { ok: true, status: 200, statusText: `OK`, data: { ok: true, data: { sections: {
      [`/Script/TBL.TBLGameUserSettings`]: { bConsoleEnabled: [`True`] }
    } } } }
  } }, () => null, async () => { throw new Error(`No input expected`) })
  const frame = {}
  const sender = { mainFrame: frame }
  const handlers = new Map<string, (event: IpcMainInvokeEvent) => unknown>()
  new ConsoleSetupIpc({ handle: (channel, listener) => { handlers.set(channel, listener) } }, service, {
    getCurrent: () => ({ webContents: sender }), sendToCurrent: () => undefined
  } as unknown as OverlayWindowController).register()
  const enable = handlers.get(`core:enableConsole`)!
  await assert.rejects(async () => enable({ sender: { mainFrame: frame }, senderFrame: frame } as unknown as IpcMainInvokeEvent))
  await assert.rejects(async () => enable({ sender, senderFrame: {} } as unknown as IpcMainInvokeEvent))
  assert.deepEqual(calls, [])
  assert.equal(await enable({ sender, senderFrame: frame } as unknown as IpcMainInvokeEvent), true)
  assert.deepEqual(calls, [
    `PATCH /chivalry2/gameusersettings/?key=bConsoleEnabled&value=True`,
    `GET /chivalry2/gameusersettings/`
  ])
})
