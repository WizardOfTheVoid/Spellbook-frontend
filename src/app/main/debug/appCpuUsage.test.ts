import assert from 'node:assert/strict'
import test from 'node:test'
import { AppCpuUsage } from './appCpuUsage'
import { harness } from './debugTestHarness'

test(`App CPU sums process percentages and samples at most once per second`, () => {
  let now = 0
  let calls = 0
  const cpu = new AppCpuUsage(() => {
    calls++
    return [{ cpu: { percentCPUUsage: 2 } }, { cpu: { percentCPUUsage: 3 } }]
  }, () => now)
  assert.equal(cpu.read(), null)
  now = 1000
  assert.equal(cpu.read(), 5)
  now = 1500
  assert.equal(cpu.read(), 5)
  assert.equal(calls, 2)
})

test(`unavailable metrics leave Debug usable`, () => {
  const cpu = new AppCpuUsage(() => { throw new Error(`Unavailable`) })
  assert.equal(cpu.read(), null)
})

test(`enabled Debug snapshots include App CPU`, async () => {
  const h = harness({ getAppCpuPercent: () => 12 })
  assert.equal((await h.session.getState()).appCpuPercent, null)
  await h.session.setEnabled(true)
  assert.equal((await h.session.getState()).appCpuPercent, 12)
  await h.session.setEnabled(false)
  assert.equal((await h.session.getState()).appCpuPercent, null)
})
