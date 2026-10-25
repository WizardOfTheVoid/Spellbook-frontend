import assert from 'node:assert/strict'
import test from 'node:test'
import type { TelemetryEvent, TelemetrySnapshot } from '../session/telemetryModels'
import { eventParticipants, filterEventFeed, sumEventAmount } from './eventFeedFilters'

const events: TelemetryEvent[] = [
  { id: `hit`, timeMs: 1200, kind: `damage`, actorId: `a`, targetId: `b`, contributorIds: [], amount: 25, count: 1, itemClass: null, relationship: null, detail: `Melee` },
  { id: `death`, timeMs: 1300, kind: `death`, actorId: null, targetId: `b`, contributorIds: [`a`, `c`], amount: null, count: 1, itemClass: null, relationship: null, detail: `Observed death` },
  { id: `items`, timeMs: 1400, kind: `itemObserved`, actorId: `a`, targetId: null, contributorIds: [], amount: null, count: 100, itemClass: `Arrow`, relationship: `instigator`, detail: `First observed` },
]
const snapshot: TelemetrySnapshot = { timeMs: 1500, events, players: [], paths: [] }

test(`search includes every contributor, event references, item class and attribution role`, () => {
  assert.deepEqual(filterEventFeed(events, snapshot, { kind: ``, query: ` c ` }).map(event => event.id), [`death`])
  assert.deepEqual(filterEventFeed(events, snapshot, { kind: ``, query: `ARROW` }).map(event => event.id), [`items`])
  assert.deepEqual(filterEventFeed(events, snapshot, { kind: `itemObserved`, query: `instigator` }), [events[2]])
  assert.deepEqual(filterEventFeed(events, snapshot, { kind: `damage`, query: `Arrow` }), [])
})

test(`filters preserve source item counts and events`, () => {
  assert.equal(filterEventFeed(events, snapshot, { kind: `itemObserved`, query: `` })[0].count, 100)
  assert.equal(events.length, 3)
})

test(`participants retain multiple contributors and never infer a sole killer`, () => {
  assert.deepEqual(eventParticipants(events[1]), [
    { id: `b`, role: `Player` }, { id: `a`, role: `Contributor` }, { id: `c`, role: `Contributor` },
  ])
  assert.deepEqual(eventParticipants({ ...events[1], actorId: `a`, contributorIds: [`a`, `a`, `c`] }), [
    { id: `a`, role: `Contributor` }, { id: `b`, role: `Player` }, { id: `c`, role: `Contributor` },
  ])
})

test(`item participants retain owner and instigator roles`, () => {
  assert.deepEqual(eventParticipants(events[2]), [{ id: `a`, role: `Instigator` }])
  assert.deepEqual(eventParticipants({ ...events[2], relationship: `owner` }), [{ id: `a`, role: `Owner` }])
})

test(`unknown combat amounts remain unknown in totals`, () => {
  assert.equal(sumEventAmount(events, `damage`), 25)
  assert.equal(sumEventAmount([...events, { ...events[0], id: `unknown`, amount: null }], `damage`), null)
  assert.equal(sumEventAmount(events, `heal`), 0)
})
