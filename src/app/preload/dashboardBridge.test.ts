import assert from 'node:assert/strict'
import test from 'node:test'
import { createDashboardBridge } from './dashboardBridge'

test(`maps one Dashboard call without a payload`, async () => {
  const calls: unknown[][] = []
  const bridge = createDashboardBridge({
    invoke: async (...args: unknown[]) => { calls.push(args) },
  })

  await bridge.dashboard.get()

  assert.deepEqual(calls, [[`server:dashboard:get`]])
})
