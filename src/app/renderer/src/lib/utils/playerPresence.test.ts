import assert from 'node:assert/strict'
import test from 'node:test'
import { formatPlayerPresenceTooltip, parsePlayerPresence } from './playerPresence.js'

const presence = {
  isOnline: true, observedAt: `2026-09-06T12:00:00.000Z`,
  server: { id: 10, name: `Duel`, durationSeconds: 123, durationObservedAt: `2026-09-06T11:59:50.000Z` }
}

test(`presence tooltips contain only the server and a whole-number duration`, () => {
  for (const [durationSeconds, expected] of [
    [0, `Duel (0+ sec)`], [59, `Duel (59+ sec)`], [60, `Duel (1+ min)`],
    [3599, `Duel (59+ min)`], [3600, `Duel (1+ hrs)`], [7199, `Duel (1+ hrs)`]
  ] as const) {
    assert.equal(formatPlayerPresenceTooltip({ ...presence, server: { ...presence.server, durationSeconds } }), expected)
  }
  assert.equal(formatPlayerPresenceTooltip({ ...presence, server: { ...presence.server, durationSeconds: null } }), `Duel`)
})

test(`offline and unavailable presence have no location tooltip`, () => {
  for (const input of [undefined, null, { ...presence, isOnline: false }]) {
    assert.equal(formatPlayerPresenceTooltip(input), ``)
  }
})

test(`accepts permitted server duration including zero and unavailable values`, () => {
  assert.deepEqual(parsePlayerPresence(presence), presence)
  for (const durationSeconds of [0, null]) {
    const input = { ...presence, server: { ...presence.server, durationSeconds } }
    assert.deepEqual(parsePlayerPresence(input), input)
  }
})

test(`missing and redacted presence never reuse a previous location`, () => {
  assert.equal(parsePlayerPresence(undefined), null)
  assert.equal(parsePlayerPresence(null), null)
  assert.deepEqual(parsePlayerPresence({ ...presence, server: null }), { ...presence, server: null })
})

test(`rejects fractional or invalid duration instead of displaying misleading session data`, () => {
  for (const durationSeconds of [123.99, -1, Infinity, NaN, `123`, 4294967296]) {
    assert.throws(() => parsePlayerPresence({ ...presence, server: { ...presence.server, durationSeconds } }))
  }
  assert.throws(() => parsePlayerPresence({ ...presence, isOnline: `true` }))
})


test(`hidden servers disclose only the measured duration`, () => {
  assert.equal(formatPlayerPresenceTooltip({ ...presence, durationSeconds: 123, server: null }), `In a server for 2+ min`)
  assert.equal(formatPlayerPresenceTooltip({ ...presence, durationSeconds: null, server: null }), `In a server`)
  assert.equal(formatPlayerPresenceTooltip({ ...presence, durationSeconds: 0, server: null }), `In a server for 0+ sec`)
})

test(`parses duration without a server and rejects invalid public durations`, () => {
  const input = { ...presence, durationSeconds: 123, server: null }
  assert.deepEqual(parsePlayerPresence(input), input)
  for (const durationSeconds of [-1, 1.2, Infinity, `123`]) {
    assert.throws(() => parsePlayerPresence({ ...input, durationSeconds }))
  }
})
