import assert from 'node:assert/strict'
import test from 'node:test'
import { actionEventsVirtualOptions } from './actionEventsVirtual'

test(`10,000 loaded events keep a bounded virtual window with a distant interaction owner`, async () => {
  const { Virtualizer } = await import('@tanstack/svelte-virtual')
  const items = Array.from({ length: 10_000 }, (_, id) => ({ id }))
  const virtualizer = new Virtualizer<HTMLElement, HTMLElement>({
    ...actionEventsVirtualOptions(items, [1, 9999, 1]), getScrollElement: () => null,
    initialRect: { width: 800, height: 800 }, initialOffset: 10_000,
    observeElementRect() {}, observeElementOffset() {}, scrollToFn() {}
  })
  const visible = virtualizer.getVirtualItems()
  assert.ok(visible.length < 30)
  assert.equal(visible.some(row => row.key === `1`), true)
  assert.equal(visible.filter(row => row.key === `9999`).length, 1)
  assert.equal(visible.some(row => row.index > 50 && row.index < 100), true)
})
