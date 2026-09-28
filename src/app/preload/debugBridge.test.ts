import assert from 'node:assert/strict'
import test from 'node:test'
import { createDebugBridge, createDebugObserver } from './debugBridge'

test(`Debug observer subscribes and unsubscribes without exposing execution`, async () => {
  const listeners = new Map<string, (...args: any[]) => void>()
  const ipc = { invoke: async (channel: string) => channel, on: (channel: string, callback: any) => listeners.set(channel, callback), removeListener: (channel: string) => listeners.delete(channel) }
  const observed: unknown[] = []
  const bridge = createDebugObserver(ipc as any)
  const stop = bridge.onState(state => observed.push(state))
  listeners.get(`debug:state`)!(null, { enabled: true })
  assert.deepEqual(observed, [{ enabled: true }])
  assert.equal(await bridge.getState(), `debug:get-state`)
  assert.equal(`run` in bridge, false)
  stop()
  assert.equal(listeners.size, 0)
})

test(`Debug command bridge sends typed operations to Main`, async () => {
  const calls: unknown[] = []
  const ipc = { invoke: async (...args: unknown[]) => { calls.push(args) }, on: () => undefined, removeListener: () => undefined }
  const bridge = createDebugBridge(ipc as any)
  await bridge.run(2)
  await bridge.setArmed(true)
  await bridge.queue(`cancel`, `test-action`)
  assert.deepEqual(calls, [
    [`debug:control`, `run`, [2]], [`debug:control`, `setArmed`, [true]], [`debug:control`, `queue`, [`cancel`, `test-action`]]
  ])
})
