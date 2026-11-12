import assert from 'node:assert/strict'
import test from 'node:test'
import { createForensicsBridge } from './forensicsBridge'

test(`forensics bridge forwards the analysis read channels`, async () => {
  const calls: unknown[] = []
  const bridge = createForensicsBridge({ invoke: async (...args: unknown[]) => { calls.push(args); return { ok: true } } } as never)
  await bridge.vectors()
  await bridge.ping(7)
  await bridge.triangulate(7)
  assert.deepEqual(calls, [[`server:forensics:alt:vectors`], [`server:forensics:alt:ping`, 7], [`server:forensics:alt:triangulate`, 7]])
})
