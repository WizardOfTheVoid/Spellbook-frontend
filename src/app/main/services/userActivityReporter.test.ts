import assert from 'node:assert/strict'
import test from 'node:test'
import { UserActivityReporter } from './userActivityReporter'

test(`records startup once, pulses every five minutes, and stops on logout`, async context => {
  context.mock.timers.enable({ apis: [`setInterval`] })
  const calls: unknown[] = []
  const reporter = new UserActivityReporter(`1.2.3`, async body => { calls.push(body); return { ok: true } })
  reporter.update(7)
  await Promise.resolve()
  reporter.update(7)
  context.mock.timers.tick(299_999)
  assert.deepEqual(calls, [{ version: `1.2.3`, startup: true }])
  context.mock.timers.tick(1)
  await Promise.resolve()
  assert.deepEqual(calls[1], { version: `1.2.3`, startup: false })
  reporter.update(null)
  context.mock.timers.tick(300_000)
  assert.equal(calls.length, 2)
  reporter.update(8)
  assert.deepEqual(calls[2], { version: `1.2.3`, startup: true })
  reporter.update(null)
})

test(`retries a failed startup report and does not overlap slow pulses`, async context => {
  context.mock.timers.enable({ apis: [`setInterval`] })
  const calls: unknown[] = []
  let fail = true
  const reporter = new UserActivityReporter(`1.2.3`, async body => {
    calls.push(body)
    if (fail) throw new Error(`offline`)
    return { ok: true }
  })
  reporter.update(7)
  context.mock.timers.tick(600_000)
  assert.equal(calls.length, 1)
  await Promise.resolve()
  fail = false
  context.mock.timers.tick(300_000)
  await Promise.resolve()
  assert.deepEqual(calls[1], { version: `1.2.3`, startup: true })
  reporter.update(null)
})
