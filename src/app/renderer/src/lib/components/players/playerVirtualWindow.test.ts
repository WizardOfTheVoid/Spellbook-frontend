import assert from 'node:assert/strict'
import test from 'node:test'
import { getPlayerScrollAnchor, getPlayerScrollOffset, playerVirtualRows } from './playerVirtualWindow'

const players = Array.from({ length: 10000 }, (_, id) => ({ key: `player:${id}` }))
const getKey = (player: { key: string }) => player.key

async function createWindow(rows = players, pinned: readonly string[] = []) {
  const { Virtualizer } = await import('@tanstack/svelte-virtual')
  return new Virtualizer<HTMLElement, HTMLElement>({
    ...playerVirtualRows(rows, getKey, pinned),
    getScrollElement: () => null,
    initialRect: { width: 400, height: 760 },
    initialOffset: 8800,
    gap: 12,
    observeElementRect: () => {},
    observeElementOffset: () => {},
    scrollToFn: () => {}
  })
}

test(`renders a bounded window of the loaded results around a deep scroll position`, async () => {
  const window = await createWindow()
  const rendered = window.getVirtualItems()
  assert.equal(rendered.some(item => item.key === `player:100`), true)
  assert.ok(rendered.length <= 22)
  assert.equal(window.getTotalSize(), 879988)
})

test(`keeps interaction owners mounted once without expanding the intervening range`, async () => {
  const window = await createWindow(players, [`player:4`, `player:102`, `player:9999`, `player:4`, `missing`])
  const rendered = window.getVirtualItems()
  assert.equal(rendered.filter(item => item.key === `player:4`).length, 1)
  assert.equal(rendered.filter(item => item.key === `player:102`).length, 1)
  assert.equal(rendered.filter(item => item.key === `player:9999`).length, 1)
  assert.ok(rendered.length <= 24)
})

test(`measurements follow stable player identity when append data updates or reorders rows`, async () => {
  const window = await createWindow()
  window.getVirtualItems()
  window.resizeItem(100, 160)
  const reordered = [...players]
  const movedPlayer = reordered[100]
  reordered[100] = reordered[101]
  reordered[101] = movedPlayer
  window.setOptions({ ...window.options, ...playerVirtualRows(reordered, getKey, []) })
  assert.equal(window.getVirtualItems().find(item => item.key === `player:100`)?.size, 160)
  assert.equal(window.getVirtualItems().find(item => item.key === `player:101`)?.size, 76)
})

test(`restores the same player and within-row offset after preceding row heights change`, async () => {
  const window = await createWindow()
  const anchor = getPlayerScrollAnchor(window, 8832)
  assert.deepEqual(anchor, { key: `player:100`, offset: 32 })
  window.resizeItem(99, 160)
  assert.equal(getPlayerScrollOffset(window, anchor, 8832), 8916)
})

test(`uses a saved scroll offset when the anchor is missing from the current query`, async () => {
  const window = await createWindow()
  assert.equal(getPlayerScrollOffset(window, { key: `removed`, offset: 32 }, 420), 420)
  assert.equal(getPlayerScrollOffset(window, null, 420), 420)
  const empty = await createWindow([])
  assert.equal(getPlayerScrollAnchor(empty, 0), null)
})
