import assert from 'node:assert/strict'
import test from 'node:test'
import { observeOverlayInputFocus } from './overlayInputFocus'

function fixture() {
  class Control {
    isConnected = true
    constructor(readonly editable: boolean) {}
    closest() { return this.editable ? this : null }
  }
  let changed: (() => void) | undefined
  let disconnected = false
  const view = new EventTarget()
  Object.assign(view, { MutationObserver: class {
    constructor(callback: () => void) { changed = callback }
    observe() {}
    disconnect() { disconnected = true }
  } })
  const doc = Object.assign(new EventTarget(), { activeElement: new Control(false), defaultView: view })
  const input = new Control(true)
  const secondInput = new Control(true)
  const body = doc.activeElement
  const states: boolean[] = []
  const stop = observeOverlayInputFocus(doc as unknown as Document, focused => states.push(focused))
  const focus = (control: Control) => {
    const previous = doc.activeElement
    doc.activeElement = control
    doc.dispatchEvent(Object.assign(new Event(`focusout`), { relatedTarget: control }))
    doc.dispatchEvent(new Event(`focusin`))
    return previous
  }
  return { doc, view, states, input, secondInput, body, stop, focus,
    mutate: () => changed?.(), disconnected: () => disconnected }
}

test(`focus without typing stays true, input transfers do not emit false, and blur clears it`, context => {
  context.mock.timers.enable({ apis: [`setTimeout`, `setInterval`] })
  const h = fixture()
  h.focus(h.input)
  assert.deepEqual(h.states, [false, true])
  context.mock.timers.tick(60_000)
  assert.deepEqual(h.states, [false, true])
  h.focus(h.secondInput)
  assert.deepEqual(h.states, [false, true])
  h.focus(h.body)
  assert.deepEqual(h.states, [false, true, false])
  h.stop()
})

test(`a null-relatedTarget focusout reads final DOM focus without clearing OS blur`, async () => {
  const h = fixture()
  h.focus(h.input)
  h.doc.dispatchEvent(Object.assign(new Event(`focusout`), { relatedTarget: null }))
  h.view.dispatchEvent(new Event(`blur`))
  await Promise.resolve()
  assert.deepEqual(h.states, [false, true])
  h.doc.activeElement = h.body
  h.doc.dispatchEvent(Object.assign(new Event(`focusout`), { relatedTarget: null }))
  h.doc.activeElement = h.secondInput
  h.doc.dispatchEvent(new Event(`focusin`))
  await Promise.resolve()
  assert.deepEqual(h.states, [false, true])
  h.doc.dispatchEvent(Object.assign(new Event(`focusout`), { relatedTarget: null }))
  h.doc.activeElement = h.body
  await Promise.resolve()
  assert.deepEqual(h.states, [false, true, false])
  h.stop()
})

test(`removed focused controls clear focus, window focus resyncs, and cleanup removes observers`, async () => {
  const h = fixture()
  h.focus(h.input)
  h.input.isConnected = false
  h.doc.activeElement = h.body
  h.mutate()
  assert.deepEqual(h.states, [false, true, false])
  h.doc.activeElement = h.secondInput
  h.view.dispatchEvent(new Event(`focus`))
  assert.equal(h.states.at(-1), true)
  h.doc.dispatchEvent(Object.assign(new Event(`focusout`), { relatedTarget: null }))
  h.stop()
  const count = h.states.length
  h.focus(h.body)
  h.view.dispatchEvent(new Event(`focus`))
  await Promise.resolve()
  assert.equal(h.states.length, count)
  assert.equal(h.disconnected(), true)
})
