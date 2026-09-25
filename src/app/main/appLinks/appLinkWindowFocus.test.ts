import assert from 'node:assert/strict'
import test from 'node:test'
import { AppLinkInbox } from './appLinkInbox'
import { AppLinkWindowFocus } from './appLinkWindowFocus'
import { startApplication } from '../services/applicationStartup'

test(`player links received during Core startup wait for the normal renderer creation`, () => {
  const inbox = new AppLinkInbox()
  let shown = 0
  const focus = new AppLinkWindowFocus(inbox, () => { shown += 1 })
  assert.equal(focus.accept(`spellbook://players/ABC_123`), true)
  assert.equal(shown, 0)
  assert.equal(inbox.pending()?.playfabId, `ABC_123`)
  focus.windowReady()
  assert.equal(shown, 0)
  assert.equal(inbox.pending()?.playfabId, `ABC_123`)
  assert.equal(focus.accept(`spellbook://players/DEF_456`), true)
  assert.equal(shown, 1)
  assert.equal(inbox.pending()?.playfabId, `DEF_456`)
  assert.equal(focus.accept(`spellbook://other/ABC_123`), false)
  assert.equal(shown, 1)
})

test(`second-instance player link does not show a renderer while packaged Core is starting`, async () => {
  const inbox = new AppLinkInbox()
  const events: string[] = []
  const focus = new AppLinkWindowFocus(inbox, () => { events.push(`show`) })
  let finishCore!: (connection: { baseUrl: string, authToken: string }) => void
  const core = new Promise<{ baseUrl: string, authToken: string }>(resolve => { finishCore = resolve })
  const startup = startApplication({
    isPackaged: true,
    startCore: async () => core,
    setCoreConnection: () => { events.push(`core`) },
    registerIpc: () => { events.push(`ipc`) },
    createWindow: () => { events.push(`window`); focus.windowReady() },
    startMonitor: () => undefined,
    startTray: () => undefined,
    reportFatalError: () => { throw new Error(`Unexpected startup failure`) }
  })
  focus.accept(`spellbook://players/ABC_123`)
  assert.deepEqual(events, [])
  assert.equal(inbox.pending()?.playfabId, `ABC_123`)
  finishCore({ baseUrl: `http://127.0.0.1:48125`, authToken: `test-token` })
  await startup
  assert.deepEqual(events, [`core`, `ipc`, `window`])
  assert.equal(inbox.pending()?.playfabId, `ABC_123`)
})
