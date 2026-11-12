import assert from 'node:assert/strict'
import test from 'node:test'
import { createAppUpdateBridge } from './appUpdateBridge'

test(`bridge invokes fixed updater commands and removes only its own listener`, async () => {
  const calls: unknown[][] = []
  const listeners = new Set<(...args: any[]) => void>()
  const bridge = createAppUpdateBridge({
    invoke: async (...args: unknown[]) => {
      calls.push(args)
      return null
    },
    on: (_channel: string, listener: (...args: any[]) => void) => {
      listeners.add(listener)
    },
    removeListener: (_channel: string, listener: (...args: any[]) => void) => {
      listeners.delete(listener)
    },
  })
  await bridge.checkForUpdate()
  await bridge.openUpdatePage()
  await bridge.getUpdateState()
  await bridge.installUpdate()
  await bridge.restartApplication()
  assert.deepEqual(calls, [
    [`app:update:check`],
    [`app:update:open`],
    [`app:update:state`],
    [`app:update:install`],
    [`app:update:restart`],
  ])
  let state: unknown
  const stop = bridge.onUpdateChanged((value) => {
    state = value
  })
  const other = bridge.onUpdateChanged(() => undefined)
  for (const listener of listeners) listener({}, { phase: `ready` })
  assert.deepEqual(state, { phase: `ready` })
  stop()
  assert.equal(listeners.size, 1)
  other()
  assert.equal(listeners.size, 0)
})
