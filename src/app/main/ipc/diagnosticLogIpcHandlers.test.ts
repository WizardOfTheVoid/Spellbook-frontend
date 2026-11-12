import assert from 'node:assert/strict'
import test from 'node:test'
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { DiagnosticLogService } from '../services/diagnosticLogService'
import { DiagnosticLogIpcHandlers } from './diagnosticLogIpcHandlers'

type Handler = (event: IpcMainInvokeEvent, payload?: unknown) => unknown

test(`export writes only the dialog-selected destination and returns cancellation without writing`, async () => {
  const fixture = createFixture()
  assert.deepEqual(await fixture.exportLogs(), { status: `cancelled` })
  assert.deepEqual(fixture.exports, [])
  fixture.destination = `chosen.log`
  assert.deepEqual(await fixture.exportLogs(), { status: `saved` })
  assert.deepEqual(fixture.exports, [`chosen.log`])
})

test(`export failures return a safe error and allow retry`, async () => {
  const fixture = createFixture()
  fixture.destination = `chosen.log`
  fixture.fail = true
  assert.deepEqual(await fixture.exportLogs(), { status: `error` })
  fixture.fail = false
  assert.deepEqual(await fixture.exportLogs(), { status: `saved` })
  assert.deepEqual(fixture.entries, [[`main`, { level: `error`, message: `Diagnostic log export failed.` }]])
})

test(`diagnostic IPC rejects malformed events, subframes and external senders`, async () => {
  const fixture = createFixture()
  for (const payload of [null, `message`, { level: `debug`, message: `bad` }, { level: `warn`, message: {} }]) {
    fixture.write(payload)
  }
  fixture.event.senderFrame!.url = `https://external.example`
  fixture.write({ level: `error`, message: `bad` })
  assert.deepEqual(await fixture.exportLogs(), { status: `error` })
  fixture.event.senderFrame!.url = `spellbook://renderer/`
  fixture.event.senderFrame = { url: `spellbook://renderer/` }
  fixture.write({ level: `error`, message: `bad` })
  assert.deepEqual(fixture.entries, [])
  fixture.event.senderFrame = fixture.event.sender.mainFrame
  fixture.write({ level: `warn`, message: `Useful warning` })
  assert.deepEqual(fixture.entries, [[`renderer`, { level: `warn`, message: `Useful warning` }]])
})

function createFixture() {
  const handlers = new Map<string, Handler>()
  const frame = { url: `spellbook://renderer/` }
  const fixture = {
    destination: undefined as string | undefined,
    fail: false,
    exports: [] as string[],
    entries: [] as unknown[][],
    event: { senderFrame: frame, sender: { mainFrame: frame } },
    write: (payload: unknown) => handlers.get(`diagnostics:write`)!(fixture.event as unknown as IpcMainInvokeEvent, payload),
    exportLogs: async () => handlers.get(`diagnostics:export`)!(fixture.event as unknown as IpcMainInvokeEvent),
  }
  const ipcMain = {
    handle: (name: string, handler: Handler) => handlers.set(name, handler),
    on: (name: string, handler: Handler) => handlers.set(name, handler),
  } as unknown as IpcMain
  const logs = {
    write: (...entry: unknown[]) => fixture.entries.push(entry),
    exportTo: async (path: string) => {
      if (fixture.fail) throw new Error(`Private filesystem failure`)
      fixture.exports.push(path)
    },
  } as unknown as DiagnosticLogService
  new DiagnosticLogIpcHandlers(ipcMain, logs, async () => fixture.destination, `spellbook://renderer/`).register()
  return fixture
}
