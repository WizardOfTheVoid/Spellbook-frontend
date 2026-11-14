import assert from 'node:assert/strict'
import test from 'node:test'
import { ActionEventsHistory } from './actionEventsHistory'
import { ActionEventsFeed } from './actionEventsFeed'
import { createActionEventsMock } from './actionEventsFixtures'

test(`navigation references retain distinct loaded histories without copying their events`, async () => {
  const history = new ActionEventsHistory()
  const feed = new ActionEventsFeed(createActionEventsMock({ count: 300, simulate: false }), { onChange() {} })
  await feed.setActive(true)
  const first = feed.state
  const firstKey = history.save(first)
  assert.equal(history.save(first), firstKey)
  await feed.append()
  const older = feed.state
  const olderKey = history.save(older)
  const restored = history.get(structuredClone(olderKey))!
  assert.equal(restored, older)
  assert.equal(restored.items.length, 130)
  assert.equal(history.get(firstKey), first)
  assert.equal(first.items.length, 30)
  feed.dispose()
})

test(`a navigation reference from another account session cannot restore its data`, () => {
  const first = new ActionEventsHistory()
  const second = new ActionEventsHistory()
  const feed = new ActionEventsFeed(createActionEventsMock({ count: 0 }), { onChange() {} })
  assert.equal(second.get(first.save(feed.state)), undefined)
  feed.dispose()
})

test(`reduced access clears saved navigation and permits saving a fresh reference`, () => {
  const history = new ActionEventsHistory()
  const feed = new ActionEventsFeed(createActionEventsMock({ count: 0 }), { onChange() {} })
  const previous = history.save(feed.state)
  history.clear()
  assert.equal(history.get(previous), undefined)
  const current = history.save(feed.state)
  assert.notEqual(current, previous)
  assert.equal(history.get(current), feed.state)
  feed.dispose()
})
