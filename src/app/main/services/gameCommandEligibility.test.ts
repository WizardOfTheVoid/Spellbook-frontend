import assert from 'node:assert/strict'
import test from 'node:test'
import type { CoreCallResult } from '../types'
import { GameCommandEligibility } from './gameCommandEligibility'

test('visible overlay is interactive without consulting Core', async () => {
  const fixture = createFixture(true)

  assert.deepEqual(await fixture.eligibility.check(), { kind: `interactive` })
  assert.equal(fixture.calls.length, 0)
})

test('hidden overlay is eligible only while the foreground game is idle', async () => {
  const fixture = createFixture(false, meta({
    focus: { gameIsFocused: true },
    movement: { available: true, isMoving: false }
  }))

  assert.deepEqual(await fixture.eligibility.check(), { kind: `hidden-idle` })
  assert.deepEqual(fixture.calls, [`/v2/meta/get`])
})

test('hidden activity and unavailable state defer with a specific reason', async () => {
  const cases: Array<[CoreCallResult, string]> = [
    [meta({ focus: { gameIsFocused: true }, movement: { available: true, isMoving: true } }), `movement`],
    [meta({ focus: { gameIsFocused: false }, movement: { available: true, isMoving: false } }), `game-unfocused`],
    [meta({ focus: { gameIsFocused: true }, movement: { available: false, isMoving: false } }), `unavailable`],
    [meta({ focus: {}, movement: {} }), `unavailable`],
    [failure(), `unavailable`]
  ]

  for (const [response, reason] of cases) {
    const fixture = createFixture(false, response)
    assert.deepEqual(await fixture.eligibility.check(), { kind: `defer`, reason })
  }
})

function createFixture(visible: boolean, response = failure()) {
  const calls: string[] = []
  const eligibility = new GameCommandEligibility(
    { isVisible: () => visible },
    {
      callCore: async path => {
        calls.push(path)
        return response
      }
    }
  )
  return { eligibility, calls }
}

function meta(data: Record<string, unknown>): CoreCallResult {
  return {
    ok: true,
    status: 200,
    statusText: `OK`,
    data: { ok: true, data }
  }
}

function failure(): CoreCallResult {
  return {
    ok: false,
    status: 503,
    statusText: `UNAVAILABLE`,
    data: null
  }
}
