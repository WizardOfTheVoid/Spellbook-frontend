import assert from 'node:assert/strict'
import test from 'node:test'
import type { DiscordQueueEntry, DiscordQueuePage } from '@spellbook/shared/discordBroadcasts.js'
import { DiscordQueueController } from './discordQueueController'

const entry = (id: number) => ({ id } as DiscordQueueEntry)

test(`queue appends cursor pages and refresh replaces old delivery states`, async () => {
  const calls: Array<number | undefined> = []
  const pages: DiscordQueuePage[] = [
    { deliveries: [entry(3)], nextBeforeId: 3 },
    { deliveries: [entry(2)], nextBeforeId: null },
    { deliveries: [entry(4)], nextBeforeId: null }
  ]
  const controller = new DiscordQueueController(async beforeId => { calls.push(beforeId); return pages.shift()! }, () => {})
  controller.setContext(1, true)
  await controller.load()
  await controller.load(true)
  assert.deepEqual(controller.state.deliveries.map(item => item.id), [3, 2])
  await controller.load()
  assert.deepEqual(controller.state.deliveries.map(item => item.id), [4])
  assert.deepEqual(calls, [undefined, 3, undefined])
})

test(`queue discards a response after navigation or account changes`, async () => {
  let resolve!: (page: DiscordQueuePage) => void
  const pending = new Promise<DiscordQueuePage>(done => { resolve = done })
  const controller = new DiscordQueueController(async () => pending, () => {})
  controller.setContext(1, true)
  const load = controller.load()
  controller.setContext(2, false)
  resolve({ deliveries: [entry(9)], nextBeforeId: null })
  await load
  assert.deepEqual(controller.state.deliveries, [])
  assert.equal(controller.state.loading, false)
})

test(`failed refresh preserves rows and exposes a retryable error`, async () => {
  let fail = false
  const controller = new DiscordQueueController(async () => {
    if (fail) throw new Error(`Server unavailable`)
    return { deliveries: [entry(3)], nextBeforeId: null }
  }, () => {})
  controller.setContext(1, true)
  await controller.load()
  fail = true
  await controller.load()
  assert.equal(controller.state.deliveries[0]!.id, 3)
  assert.equal(controller.state.error, `Server unavailable`)
  assert.equal(controller.state.loading, false)
})
