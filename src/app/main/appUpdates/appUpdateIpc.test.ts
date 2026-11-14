import assert from 'node:assert/strict'
import test from 'node:test'
import { AppUpdateIpc } from './appUpdateIpc'

test(`only the current main window's main frame may use updater operations`, async () => {
  const handlers = new Map<string, (...args: any[]) => any>()
  const mainFrame = {}
  const contents = { mainFrame }
  const calls: string[] = []
  let listener!: (state: any) => void
  let unsubscribed = false
  const sent: unknown[][] = []
  const updates = {
    check: async () => {
      calls.push(`check`)
      return `1.0.1`
    },
    openLatestRelease: async () => {
      calls.push(`open`)
    },
    getState: () => ({ phase: `ready` }),
    restartAndInstall: async () => {
      calls.push(`install`)
    },
    restartApplication: async () => {
      calls.push(`restart`)
    },
    subscribe: (next: typeof listener) => {
      listener = next
      return () => {
        unsubscribed = true
      }
    },
  }
  const ipc = {
    handle: (name: string, run: (...args: any[]) => any) => handlers.set(name, run),
    removeHandler: (name: string) => handlers.delete(name),
  }
  const window = {
    getCurrent: () => ({ webContents: contents }),
    sendToCurrent: (...args: unknown[]) => sent.push(args),
  }
  const dispose = new AppUpdateIpc(ipc as never, updates as never, window as never).register()
  for (const [channel, run] of handlers) {
    for (const event of [{ sender: {} }, { sender: contents }, { sender: contents, senderFrame: {} }])
      await assert.rejects(() => run(event))
    await run({ sender: contents, senderFrame: mainFrame }, `ignored renderer URL`)
  }
  assert.deepEqual(calls, [`check`, `open`, `install`, `restart`])
  listener({ phase: `ready` })
  assert.deepEqual(sent, [[`app:update:changed`, { phase: `ready` }]])
  dispose()
  assert.equal(unsubscribed, true)
  assert.equal(handlers.size, 0)
})
