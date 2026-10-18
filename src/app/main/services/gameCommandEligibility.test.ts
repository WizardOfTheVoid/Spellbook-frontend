import assert from 'node:assert/strict'
import test from 'node:test'
import { GameCommandEligibility } from './gameCommandEligibility'

for (const visible of [false, true]) for (const sentinel of [false, true]) {
  test(`mode selection with overlay visible ${visible} and Sentinel ${sentinel} leaves activity eligibility to Core`, async () => {
    const mode = new GameCommandEligibility({ isVisible: () => visible }, { getState: () => ({ enabled: sentinel }) })
    assert.deepEqual(await mode.check(), { kind: sentinel ? `sentinel` : visible ? `interactive` : `background` })
  })
}
