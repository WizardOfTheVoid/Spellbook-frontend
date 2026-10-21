import assert from 'node:assert/strict'
import test from 'node:test'
import { resolvePulseConfig } from './pulseConfig'

test(`pulses select millisecond defaults by priority with a Sentinel override`, () => {
  const config = resolvePulseConfig({})
  for (const [priority, expected] of [[`low`, 5000], [`normal`, 2500], [`high`, 1000]] as const) {
    assert.equal(config.getPulseMs(priority), expected)
    assert.equal(config.getPulseMs(priority, true), 100)
  }
})

test(`custom pulse values retain milliseconds and support timer boundaries`, () => {
  const config = resolvePulseConfig({
    PULSE_LOW_MS: ` 2147483647 `,
    PULSE_NORMAL_MS: `25`,
    PULSE_HIGH_MS: `10`,
    PULSE_SENTINEL_MS: `1`
  })
  assert.equal(config.getPulseMs(`low`), 2147483647)
  assert.equal(config.getPulseMs(`normal`), 25)
  assert.equal(config.getPulseMs(`high`), 10)
  assert.equal(config.getPulseMs(`high`, true), 1)
})

test(`every pulse rejects invalid and overflowing timer delays`, () => {
  for (const key of [`PULSE_LOW_MS`, `PULSE_NORMAL_MS`, `PULSE_HIGH_MS`, `PULSE_SENTINEL_MS`]) {
    for (const value of [``, ` `, `0`, `-1`, `1.5`, `invalid`, `Infinity`, `2147483648`]) {
      assert.throws(() => resolvePulseConfig({ [key]: value }), new RegExp(key, `u`))
    }
  }
})
