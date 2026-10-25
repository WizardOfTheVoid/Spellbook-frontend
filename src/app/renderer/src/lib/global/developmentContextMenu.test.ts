import assert from 'node:assert/strict'
import test from 'node:test'
import { installDevelopmentContextMenu } from './developmentContextMenu'

function contextEvent(shiftKey = true, button = 2): Event {
  const event = new Event(`contextmenu`, { cancelable: true })
  Object.assign(event, { shiftKey, button })
  return event
}

test(`development Shift right-click bypasses app handlers without canceling the browser menu`, () => {
  const target = new EventTarget()
  let closed = 0
  let customMenus = 0
  const dispose = installDevelopmentContextMenu(target as unknown as Window, true, () => { closed += 1 })
  target.addEventListener(`contextmenu`, () => { customMenus += 1 })
  const event = contextEvent()

  target.dispatchEvent(event)

  assert.equal(event.defaultPrevented, false)
  assert.equal(closed, 1)
  assert.equal(customMenus, 0)
  dispose()
  target.dispatchEvent(contextEvent())
  assert.equal(closed, 1)
  assert.equal(customMenus, 1)
})

test(`ordinary right-clicks, keyboard menus and production retain app handlers`, () => {
  for (const [development, shiftKey, button] of [[true, false, 2], [true, true, 0], [false, true, 2]] as const) {
    const target = new EventTarget()
    let closed = 0
    let customMenus = 0
    installDevelopmentContextMenu(target as unknown as Window, development, () => { closed += 1 })
    target.addEventListener(`contextmenu`, () => { customMenus += 1 })

    target.dispatchEvent(contextEvent(shiftKey, button))

    assert.equal(closed, 0)
    assert.equal(customMenus, 1)
  }
})
