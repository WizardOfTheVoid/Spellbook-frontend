import assert from 'node:assert/strict'
import test from 'node:test'
import { createDashboardBridge } from './dashboardBridge'

test(`Dashboard scope and detail requests pass through the typed bridge`, async () => {
  const calls: unknown[][] = []
  const bridge = createDashboardBridge({ invoke: async (...args: unknown[]) => { calls.push(args) } })
  const query = { environment: `team`, period: `1Week`, timeline: `topTeams` } as const
  const detail = { query, range: { start: 100, end: 200 }, maxBuckets: 100 }
  await bridge.dashboard.get(query)
  await bridge.dashboard.timeline(detail)
  assert.deepEqual(calls, [[`server:dashboard:get`,query],[`server:dashboard:timeline`,detail]])
})
