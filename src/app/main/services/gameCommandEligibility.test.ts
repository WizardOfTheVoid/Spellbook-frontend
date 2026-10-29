import assert from 'node:assert/strict'
import test from 'node:test'
import { GameCommandEligibility } from './gameCommandEligibility'

for (const visible of [false, true]) for (const focused of [false, true]) for (const sentinel of [false, true]) {
  test(`mode selection with overlay visible ${visible}, focused ${focused} and Sentinel ${sentinel} leaves activity eligibility to Core`, async () => {
    const window = { isVisible: () => visible, isForegroundInteractive: () => visible && focused }
    const mode = new GameCommandEligibility(window, { getState: () => ({ enabled: sentinel }) })
    assert.deepEqual(await mode.check(), { kind: sentinel ? `sentinel` : visible && focused ? `interactive` : `background` })
  })
}
