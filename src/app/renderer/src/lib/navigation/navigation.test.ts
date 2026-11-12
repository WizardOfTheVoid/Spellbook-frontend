import assert from 'node:assert/strict'
import test from 'node:test'
import { navigateFromOverlay } from './navigation'

test(`overlay navigation preserves an open modal draft and works after the dialog closes`, context => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, `document`)
  let modalOpen = true
  Object.defineProperty(globalThis, `document`, { configurable: true, value: { querySelector: () => modalOpen ? {} : null } })
  context.after(() => {
    if (previous) Object.defineProperty(globalThis, `document`, previous)
    else Reflect.deleteProperty(globalThis, `document`)
  })
  let page = `wanted`
  let draft = `Player IDs awaiting submission`
  const openServer = () => {
    page = `server`
    draft = ``
  }

  navigateFromOverlay(openServer)

  assert.equal(page, `wanted`)
  assert.equal(draft, `Player IDs awaiting submission`)
  modalOpen = false
  navigateFromOverlay(openServer)
  assert.equal(page, `server`)
})
