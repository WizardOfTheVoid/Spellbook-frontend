import assert from 'node:assert/strict'
import test from 'node:test'
import { absoluteUtc, validTimezone } from './actionTime'
test(`absolute time requires an explicit offset and distinguishes repeated local times`, () => {
  assert.equal(absoluteUtc(`2026-10-25T02:30+02:00`), `2026-10-25T00:30:00.000Z`)
  assert.equal(absoluteUtc(`2026-10-25T02:30+01:00`), `2026-10-25T01:30:00.000Z`)
  assert.throws(() => absoluteUtc(`2026-10-25T02:30`), /offset/)
  assert.throws(() => absoluteUtc(`tomorrow`))
  assert.throws(() => absoluteUtc(`2026-02-30T12:00Z`), /calendar/)
  assert.equal(validTimezone(`Europe/Oslo`), true)
  assert.equal(validTimezone(`Unknown/Zone`), false)
})
