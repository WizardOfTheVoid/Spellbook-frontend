import assert from 'node:assert/strict'
import test from 'node:test'
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { CommandHistoryIpc } from './commandHistoryIpc'
import { initialCommandHistoryState, type CommandHistoryState } from '../../shared/commandHistory/commandHistory'

test(`only the eligible main frame can read current command-history state and cleared state is published`, () => {
  const handlers = new Map<string, (event: IpcMainInvokeEvent) => unknown>()
  const frame = {}
  const webContents = { mainFrame: frame }
  const event = { sender: webContents, senderFrame: frame } as unknown as IpcMainInvokeEvent
  let allowed = true
  let state: CommandHistoryState = { ...initialCommandHistoryState, revision: 1, status: `monitoring` }
  let publish!: (state: CommandHistoryState) => void
  const events: [string, unknown][] = []
  new CommandHistoryIpc({ handle: (name: string, handler: (event: IpcMainInvokeEvent) => unknown) => handlers.set(name, handler) } as unknown as IpcMain, {
    getState: () => state, subscribe: listener => { publish = listener; return () => {} }
  }, { getCurrent: () => ({ webContents }), sendToCurrent: (name: string, value: unknown) => { events.push([name, value]); return true } } as never,
  () => allowed).register()
  const read = handlers.get(`core:commandHistory`)!
  assert.equal(read(event), state)
  assert.throws(() => read({ ...event, sender: {} } as IpcMainInvokeEvent))
  assert.throws(() => read({ ...event, senderFrame: {} } as IpcMainInvokeEvent))
  allowed = false
  assert.throws(() => read(event))
  state = { ...initialCommandHistoryState, revision: 2, status: `monitoring`, reporting: {
    pending: 1, evicted: 0, error: ``, rows: { 7: { status: `recorded`, playerActionId: 19 } }
  } }
  publish(state)
  assert.deepEqual(events, [[`core:commandHistoryChanged`, { ...initialCommandHistoryState, revision: 2 }]])
})
