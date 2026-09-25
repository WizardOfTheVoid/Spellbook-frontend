import assert from 'node:assert/strict'
import test from 'node:test'
import type { PlayerTimelineEvent } from '@spellbook/shared/playerTimeline'
import { timelinePresentation } from './playerTimelinePresentation.js'

function event(kind: string, action?: string): PlayerTimelineEvent {
  return {
    id: `event:1`, kind, occurredAt: `2026-09-25T12:00:00.000Z`, summary: kind,
    details: action ? [{ label: `Action`, value: action }] : []
  }
}

test(`timeline uses the requested icon and tone for moderation and observations`, () => {
  assert.deepEqual(timelinePresentation(event(`wanted`)), { icon: `fa-crosshairs`, tone: `danger` })
  assert.deepEqual(timelinePresentation(event(`action`, `Ban`)), { icon: `fa-gavel`, tone: `danger` })
  assert.deepEqual(timelinePresentation(event(`action`, `Warning`)), { icon: `fa-gavel`, tone: `warning` })
  assert.deepEqual(timelinePresentation(event(`action`, `Kick`)), { icon: `fa-gavel`, tone: `warning` })
  assert.deepEqual(timelinePresentation(event(`progress`)), { icon: `fa-chart-line`, tone: `accent` })
  assert.deepEqual(timelinePresentation(event(`server`)), { icon: `fa-server`, tone: `neutral` })
})
