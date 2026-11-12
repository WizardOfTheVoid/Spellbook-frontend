import assert from 'node:assert/strict'
import test from 'node:test'
import { createActionEventsMenu } from './actionEventsMenu'
import { createActionEventsMock } from './actionEventsFixtures'
import { createActionEventsQuery } from './actionEventsQuery'

test(`the event menu navigates using each original player/server identity and cancels the logical event`, async () => {
  const now = Date.now()
  const source = createActionEventsMock({ count: 60, now: () => now, simulate: false })
  const { items } = await source.list({ query: createActionEventsQuery(), limit: 60, signal: new AbortController().signal })
  const sample = items.find(item => item.canCancel && item.target.type === `player`)!
  assert.ok(sample.target.type === `player` && sample.admin?.player)
  const player = { ...sample.target.player, canOpen: true }
  const adminPlayer = { ...sample.admin.player, canOpen: true }
  const event = { ...sample, target: { type: `player` as const, player }, admin: { ...sample.admin, player: adminPlayer }, server: { ...sample.server, canOpen: true } }
  const destinations: (string | number)[] = []
  const menu = createActionEventsMenu(event, false, {
    onCancel: id => { destinations.push(id) }, onOpenPlayer: player => { destinations.push(player.playfabId) }, onOpenServer: id => { destinations.push(`server:${id}`) }
  })
  for (const item of menu.items) if (typeof item.action === `function` && !item.disabled) await item.action()
  assert.deepEqual(destinations, [event.id, player.playfabId, adminPlayer.playfabId, `server:${event.server.id}`])
})

test(`server targets and missing sample identities do not offer unusable player navigation`, async () => {
  const now = Date.now()
  const source = createActionEventsMock({ count: 12, now: () => now, simulate: false })
  const { items } = await source.list({ query: createActionEventsQuery(), limit: 30, signal: new AbortController().signal })
  const sample = items.find(item => item.target.type === `server`)!
  const menu = createActionEventsMenu(sample, false, { onCancel() {}, onOpenPlayer() {}, onOpenServer() {} })
  assert.equal(menu.items.filter(item => !item.separator && !item.disabled).length, 0)
})
