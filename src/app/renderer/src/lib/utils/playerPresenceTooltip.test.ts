import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter, once } from 'node:events'
import { setImmediate } from 'node:timers/promises'
import { get } from 'svelte/store'
import type { PlayerPresence } from '@spellbook/shared/playerPresence.js'
import { createPlayerPresenceTooltip } from './playerPresenceTooltip'
import { tooltipState } from './tooltip'

const presence: PlayerPresence = {
  isOnline: true, observedAt: null, durationSeconds: 125,
  server: { id: 1, name: `Duel`, durationSeconds: 125, durationObservedAt: null }
}

class TooltipNode extends EventTarget {
  getBoundingClientRect() {
    return { left: 0, top: 0, right: 8, bottom: 8, width: 8, height: 8 }
  }
}

test(`row tooltips load only on hover and recheck permission on the next hover`, async context => {
  const original = Object.getOwnPropertyDescriptor(globalThis, `window`)
  Object.defineProperty(globalThis, `window`, { configurable: true, value: new EventTarget() })
  const node = new TooltipNode()
  const calls: string[] = []
  const action = createPlayerPresenceTooltip(async id => {
    calls.push(id)
    return calls.length === 1 ? presence : { ...presence, server: null }
  })(node as unknown as HTMLElement, { playfabId: `P1`, viewer: {} })
  context.after(() => {
    action?.destroy?.()
    if (original) Object.defineProperty(globalThis, `window`, original)
    else delete (globalThis as { window?: unknown }).window
  })

  assert.deepEqual(calls, [])
  node.dispatchEvent(new Event(`pointerenter`))
  await setImmediate()
  assert.equal(get(tooltipState)?.text, `Duel (2+ min)`)
  node.dispatchEvent(new Event(`pointerleave`))
  assert.equal(get(tooltipState), null)
  node.dispatchEvent(new Event(`pointerenter`))
  await setImmediate()
  assert.deepEqual(calls, [`P1`, `P1`])
  assert.equal(get(tooltipState)?.text, `In a server for 2+ min`)
})

test(`account changes, logout and destruction discard pending location responses`, async context => {
  const original = Object.getOwnPropertyDescriptor(globalThis, `window`)
  Object.defineProperty(globalThis, `window`, { configurable: true, value: new EventTarget() })
  const pending = new EventEmitter()
  let calls = 0
  const node = new TooltipNode()
  const action = createPlayerPresenceTooltip(async () => {
    const [result] = await once(pending, String(calls++))
    return result as PlayerPresence | null
  })(
    node as unknown as HTMLElement, { playfabId: `P1`, viewer: {} }
  )
  context.after(() => {
    action?.destroy?.()
    if (original) Object.defineProperty(globalThis, `window`, original)
    else delete (globalThis as { window?: unknown }).window
  })

  node.dispatchEvent(new Event(`focusin`))
  action?.update?.({ playfabId: `P1`, viewer: {} })
  pending.emit(`0`, presence)
  await setImmediate()
  assert.equal(get(tooltipState), null)
  action?.update?.({ playfabId: `P1`, viewer: null })
  pending.emit(`1`, presence)
  await setImmediate()
  assert.equal(get(tooltipState), null)
  action?.update?.({ playfabId: `P2`, viewer: {} })
  action?.destroy?.()
  pending.emit(`2`, presence)
  await setImmediate()
  assert.equal(get(tooltipState), null)
})

test(`profile tooltips use supplied presence and suppress failures without fallback text`, async context => {
  const original = Object.getOwnPropertyDescriptor(globalThis, `window`)
  Object.defineProperty(globalThis, `window`, { configurable: true, value: new EventTarget() })
  const node = new TooltipNode()
  let calls = 0
  const action = createPlayerPresenceTooltip(async () => {
    calls += 1
    throw new Error(`Unavailable`)
  })(
    node as unknown as HTMLElement, { presence, viewer: {} }
  )
  context.after(() => {
    action?.destroy?.()
    if (original) Object.defineProperty(globalThis, `window`, original)
    else delete (globalThis as { window?: unknown }).window
  })

  node.dispatchEvent(new Event(`focusin`))
  assert.equal(get(tooltipState)?.text, `Duel (2+ min)`)
  assert.equal(calls, 0)
  action?.update?.({ playfabId: `P1`, viewer: {} })
  await setImmediate()
  assert.equal(get(tooltipState), null)
  assert.equal(calls, 1)
})
