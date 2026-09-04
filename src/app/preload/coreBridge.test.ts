import assert from 'node:assert/strict'
import test from 'node:test'
import { createRuntimeCoreBridge, type RuntimeIpcRenderer } from './coreBridge'

test(`runtime Core bridge invokes exact metadata, snapshot, and Sentinel channels`, async () => {
  const calls: unknown[][] = []
  const bridge = createRuntimeCoreBridge({
    invoke: async (...args: unknown[]) => { calls.push(args); return args },
    on: () => undefined,
    removeListener: () => undefined
  })

  await bridge.meta()
  await bridge.currentGameSnapshot()
  await bridge.refreshCurrentGameSnapshot()
  await bridge.sentinelState()
  await bridge.setSentinelEnabled(true)

  assert.deepEqual(calls, [
    [`core:meta`],
    [`core:currentGameSnapshot`],
    [`core:refreshCurrentGameSnapshot`],
    [`core:sentinelState`],
    [`core:setSentinelEnabled`, { enabled: true }]
  ])
})

test(`runtime Core bridge listeners unwrap payloads and clean up their exact listener`, () => {
  const listeners = new Map<string, (...args: unknown[]) => void>()
  const removed: Array<[string, (...args: unknown[]) => void]> = []
  const ipc = {
    invoke: async () => undefined,
    on: (channel: string, listener: (...args: unknown[]) => void) => { listeners.set(channel, listener) },
    removeListener: (channel: string, listener: (...args: unknown[]) => void) => { removed.push([channel, listener]) }
  } satisfies RuntimeIpcRenderer
  const bridge = createRuntimeCoreBridge(ipc)
  const snapshots: unknown[] = []
  const sentinel: unknown[] = []

  const removeSnapshot = bridge.onCurrentGameSnapshot(value => snapshots.push(value))
  const removeSentinel = bridge.onSentinelStateChange(value => sentinel.push(value))
  listeners.get(`core:currentGameSnapshotChanged`)?.({}, { version: 8 })
  listeners.get(`core:sentinelStateChanged`)?.({}, { enabled: true })
  removeSnapshot()
  removeSentinel()

  assert.deepEqual(snapshots, [{ version: 8 }])
  assert.deepEqual(sentinel, [{ enabled: true }])
  assert.deepEqual(removed, [
    [`core:currentGameSnapshotChanged`, listeners.get(`core:currentGameSnapshotChanged`)!],
    [`core:sentinelStateChanged`, listeners.get(`core:sentinelStateChanged`)!]
  ])
})
