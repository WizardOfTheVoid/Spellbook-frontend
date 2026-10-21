import assert from 'node:assert/strict'
import test from 'node:test'
import { startOnboardingChecks } from './onboardingChecks'

test(`checks immediately and every ten seconds, skipping game input while offline`, async context => {
  context.mock.timers.enable({ apis: [`setInterval`] })
  let running = false
  const calls: string[] = []
  const checks = startOnboardingChecks({
    account: async () => { calls.push(`account`) },
    settings: async () => { calls.push(`settings`) },
    game: async () => running,
    binding: async () => { calls.push(`binding`) }
  })
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(calls, [`account`, `settings`])
  context.mock.timers.tick(9999)
  assert.equal(calls.length, 2)
  running = true
  context.mock.timers.tick(1)
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(calls, [`account`, `settings`, `account`, `settings`, `binding`])
  checks.stop()
  context.mock.timers.tick(10_000)
  await checks.refresh()
  assert.equal(calls.length, 5)
})

test(`slow checks do not overlap and closing prevents pending game input`, async context => {
  context.mock.timers.enable({ apis: [`setInterval`] })
  let finish!: (running: boolean) => void
  let reads = 0
  let inputs = 0
  const checks = startOnboardingChecks({
    account: async () => { reads++ },
    settings: async () => {},
    game: () => new Promise(resolve => { finish = resolve }),
    binding: async () => { inputs++ }
  })
  context.mock.timers.tick(20_000)
  await checks.refresh()
  assert.equal(reads, 1)
  checks.stop()
  finish(true)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(inputs, 0)
})

test(`an unavailable check does not prevent the other checks or later retries`, async context => {
  context.mock.timers.enable({ apis: [`setInterval`] })
  let reads = 0
  let inputs = 0
  const checks = startOnboardingChecks({
    account: async () => { throw new Error(`Unavailable`) },
    settings: async () => { reads++ },
    game: async () => true,
    binding: async () => { inputs++ }
  })
  await new Promise(resolve => setImmediate(resolve))
  context.mock.timers.tick(10_000)
  await new Promise(resolve => setImmediate(resolve))
  checks.stop()
  assert.equal(reads, 2)
  assert.equal(inputs, 2)
})
