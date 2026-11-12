import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createTelemetryBridge } from './telemetryBridge'

test(`preload exposes controls and removes subscribed listeners without stopping acquisition`, async () => {
  const listeners = new Map<string, Function>()
  const calls: unknown[][] = []
  const ipc = {
    invoke: async (...args: unknown[]) => {
      calls.push(args)
      return null
    },
    on: (name: string, listener: Function) => {
      listeners.set(name, listener)
    },
    removeListener: (name: string) => {
      listeners.delete(name)
    }
  }
  const bridge = createTelemetryBridge(ipc as never)
  const stop = bridge.subscribeUpdates(
    { recordingId: `34b61043-c474-48fa-97af-62408c7ed02e` },
    () => {}
  )
  assert.equal(listeners.size, 2)
  stop()
  assert.equal(listeners.size, 0)
  assert.equal(
    calls.some((c) => c.includes(`stopRecording`)),
    false
  )
  await bridge.stopRecording(`34b61043-c474-48fa-97af-62408c7ed02e`)
  assert.deepEqual(calls.at(-1), [
    `telemetry:call`,
    `stopRecording`,
    `34b61043-c474-48fa-97af-62408c7ed02e`
  ])
  await bridge.cancelReads({ workspaceId: `replay`, throughRequestId: 4 })
  assert.deepEqual(calls.at(-1), [`telemetry:call`, `cancelReads`, { workspaceId: `replay`, throughRequestId: 4 }])
  await bridge.getMetricHistory({ recordingId: `recording`, trackId: `player`, fromUs: 0, toUs: 1000, maxPoints: 240 })
  assert.equal(calls.at(-1)?.[1], `getMetricHistory`)
})
