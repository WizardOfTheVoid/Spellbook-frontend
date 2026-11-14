import assert from 'node:assert/strict'
import test from 'node:test'
import type { PlayerPresence } from '@spellbook/shared/playerPresence'
import type { PlayerTimelineEvent } from '@spellbook/shared/playerTimeline'
import { timelineWithPresence } from './playerTimelinePresence.js'

const observedAt = `2026-09-25T19:35:00.000Z`

function presence(serverId: number | null, isOnline = true): PlayerPresence {
  return {
    isOnline, observedAt,
    server: serverId === null ? null : {
      id: serverId, name: `Current server`, durationSeconds: 180,
      durationObservedAt: observedAt
    }
  }
}

function serverEvent(id: number, occurredAt: string, lastSeen = `2026-09-25T19:33:00.000Z`): PlayerTimelineEvent {
  return {
    id: `server:${id}:${occurredAt.slice(0, 10)}`, kind: `server`, occurredAt,
    summary: `Played on saved server`,
    segments: [
      { text: `Played on ` },
      { text: `Saved server`, target: { type: `server`, id } }
    ],
    details: [
      { label: `First seen`, value: occurredAt, format: `dateTime` },
      { label: `Last seen`, value: lastSeen, format: `dateTime` },
      { label: `Estimated playtime`, value: `40s` }
    ]
  }
}

test(`online presence stays separate from a saved visit to the same server`, () => {
  const saved = serverEvent(7, `2026-09-25T19:32:00.000Z`)
  const result = timelineWithPresence([saved], presence(7))

  assert.equal(result.length, 2)
  assert.equal(result[0]?.current, true)
  assert.equal(result[0]?.occurredAt, observedAt)
  assert.equal(result[0]?.segments?.[1]?.target?.id, 7)
  assert.deepEqual(result[0]?.details, [])
  assert.equal(result[1], saved)
})

test(`presence without a matching saved entry adds a temporary current server event`, () => {
  const old = serverEvent(7, `2026-09-23T12:00:00.000Z`)
  const result = timelineWithPresence([old], presence(7))

  assert.equal(result.length, 2)
  assert.equal(result[0]?.current, true)
  assert.equal(result[0]?.occurredAt, observedAt)
  assert.equal(result[0]?.segments?.[1]?.target?.id, 7)
  assert.equal(result[1], old)
})

test(`current presence remains first when later saved visits follow an earlier visit to that server`, () => {
  const later = serverEvent(8, `2026-09-25T19:32:00.000Z`)
  const middle = serverEvent(9, `2026-09-25T18:44:00.000Z`)
  const earlier = serverEvent(7, `2026-09-25T15:38:00.000Z`, `2026-09-25T20:00:00.000Z`)
  const result = timelineWithPresence([later, middle, earlier], {
    ...presence(7), observedAt: `2026-09-25T20:05:00.000Z`
  })

  assert.equal(result.length, 4)
  assert.equal(result[0]?.current, true)
  assert.deepEqual(result.slice(1), [later, middle, earlier])
})

test(`offline or undisclosed presence does not claim current server activity`, () => {
  const saved = serverEvent(7, `2026-09-25T19:32:00.000Z`)

  assert.deepEqual(timelineWithPresence([saved], presence(7, false)), [saved])
  assert.deepEqual(timelineWithPresence([saved], presence(null)), [saved])
})

test(`a later saved server visit prevents an older presence record from claiming Now`, () => {
  const later = serverEvent(8, `2026-09-25T19:32:00.000Z`)
  const earlier = serverEvent(7, `2026-09-25T15:38:00.000Z`)
  const oldPresence = { ...presence(7), observedAt: `2026-09-25T16:00:00.000Z` }

  assert.deepEqual(timelineWithPresence([later, earlier], oldPresence), [later, earlier])
})

test(`a later observation on another server outweighs an older presence record`, () => {
  const other = serverEvent(8, `2026-09-25T18:00:00.000Z`, `2026-09-25T20:10:00.000Z`)
  const oldPresence = { ...presence(7), observedAt: `2026-09-25T20:05:00.000Z` }

  assert.deepEqual(timelineWithPresence([other], oldPresence), [other])
})

