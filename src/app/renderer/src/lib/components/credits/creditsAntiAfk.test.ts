import assert from 'node:assert/strict'
import test from 'node:test'
import { CreditsAntiAfk } from './creditsAntiAfk'

for (const initiallyEnabled of [false, true]) {
  test(`Credits enables Anti-AFK and restores ${initiallyEnabled} on exit`, async () => {
    let enabled = initiallyEnabled
    const changes: boolean[] = []
    const controller = new CreditsAntiAfk({
      antiAfkState: async () => ({ enabled }),
      setAntiAfkEnabled: async value => {
        changes.push(value)
        enabled = value
        return { enabled }
      }
    })

    await controller.setActive(true)
    assert.equal(enabled, true)
    assert.deepEqual(changes, initiallyEnabled ? [] : [true])
    await controller.setActive(false)
    assert.equal(enabled, initiallyEnabled)
  })
}

test(`rapid Credits close and reopen restores each visit's original state`, async () => {
  let enabled = false
  const controller = new CreditsAntiAfk({
    antiAfkState: async () => ({ enabled }),
    setAntiAfkEnabled: async value => {
      await Promise.resolve()
      enabled = value
      return { enabled }
    }
  })

  const entering = controller.setActive(true)
  const leaving = controller.setActive(false)
  const reopening = controller.setActive(true)
  await Promise.all([entering, leaving, reopening])
  assert.equal(enabled, true)
  await controller.setActive(false)
  assert.equal(enabled, false)
})

test(`Credits can restore the original state after enabling fails`, async () => {
  let enabled = false
  const controller = new CreditsAntiAfk({
    antiAfkState: async () => ({ enabled }),
    setAntiAfkEnabled: async value => {
      enabled = value
      if (value) throw new Error(`Enable failed`)
      return { enabled }
    }
  })

  await assert.rejects(controller.setActive(true), /Enable failed/u)
  await controller.setActive(false)
  assert.equal(enabled, false)
})
