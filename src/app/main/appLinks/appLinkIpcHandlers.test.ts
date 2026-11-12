import assert from 'node:assert/strict'
import test from 'node:test'
import { AppLinkInbox } from './appLinkInbox'
import { AppLinkIpcHandlers } from './appLinkIpcHandlers'

test(`IPC exposes a pending parsed player link and guards acknowledgement`, async () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const signals: string[] = []
  const sender = {}
  const inbox = new AppLinkInbox()
  inbox.accept(`spellbook://players/ABC_123`)
  new AppLinkIpcHandlers(
    { handle: (name: string, callback: (...args: unknown[]) => unknown) => handlers.set(name, callback) } as never,
    inbox,
    { getCurrent: () => ({ webContents: sender }), sendToCurrent: (channel: string) => { signals.push(channel); return true } } as never
  ).register()
  const pending = handlers.get(`app-link:pending`)!
  const acknowledge = handlers.get(`app-link:acknowledge`)!
  const first = pending({ sender }) as { sequence: number, playfabId: string }
  assert.equal(first.playfabId, `ABC_123`)
  assert.equal(acknowledge({ sender: {} }, first.sequence), false)
  assert.equal(acknowledge({ sender }, `1`), false)
  inbox.accept(`spellbook://players/DEF_456`)
  assert.deepEqual(signals, [`app-link:changed`])
  assert.equal(acknowledge({ sender }, first.sequence), false)
  assert.equal((pending({ sender }) as { playfabId: string }).playfabId, `DEF_456`)
  assert.equal(acknowledge({ sender }, inbox.pending()!.sequence), true)
  assert.equal(pending({ sender }), null)
})
