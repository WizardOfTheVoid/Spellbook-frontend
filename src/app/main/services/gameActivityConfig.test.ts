import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveGameActivityConfig } from './gameActivityConfig'

test('game activity recheck defaults to 150 milliseconds', () => {
  assert.deepEqual(resolveGameActivityConfig({}), { recheckMs: 550 })
})

test('game activity recheck accepts a positive integer', () => {
  assert.deepEqual(resolveGameActivityConfig({ GAME_ACTIVITY_RECHECK_MS: `550` }), {
    recheckMs: 550
  })
})

test('game activity recheck rejects invalid values by name', () => {
  for (const value of [`0`, `-1`, `1.5`, `nope`]) {
    assert.throws(
      () => resolveGameActivityConfig({ GAME_ACTIVITY_RECHECK_MS: value }),
      /GAME_ACTIVITY_RECHECK_MS/u
    )
  }
})
