import assert from 'node:assert/strict'
import test from 'node:test'
import type { PlayerAction, PlayerDbProfile } from '$lib/core'
import { loadTimelineAction } from './playerTimelineAction.js'

const action = { id: 8, playerId: 77, actionType: `ban` } as PlayerAction
const current = { player: { id: 42, playfabId: `ADMIN` }, actions: [] } as unknown as PlayerDbProfile
const affected = { player: { id: 77, playfabId: `VICTIM`, latestName: `Knight` }, actions: [action,
  { id: 9, playerId: 77, actionType: `unban`, relatedActionId: 8 } as PlayerAction] } as unknown as PlayerDbProfile

test(`cross-player action selection retains the affected identity and offense history for controls`, async () => {
  const requested: string[] = []
  const selection = await loadTimelineAction({ type: `action`, id: 8, playerId: 77, playfabId: `VICTIM` }, current, {
    profile: async id => { requested.push(id); return affected },
    action: async () => assert.fail(`The affected profile already contains the action`)
  })
  assert.deepEqual(requested, [`VICTIM`])
  assert.equal(selection.playerId, 77)
  assert.deepEqual(selection.timelineContext, { playerId: 77, playfabId: `VICTIM`, name: `Knight`, actions: affected.actions })
})

test(`cross-player selection rejects mismatched identity and action responses`, async () => {
  await assert.rejects(loadTimelineAction({ type: `action`, id: 8, playerId: 77, playfabId: `ADMIN` }, current, {
    profile: async () => current, action: async () => action
  }), /identity/iu)
  await assert.rejects(loadTimelineAction({ type: `action`, id: 8, playerId: 77, playfabId: `VICTIM` }, current, {
    profile: async () => ({ ...affected, actions: [] }), action: async () => ({ ...action, playerId: 42 })
  }), /player/iu)
})
