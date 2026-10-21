import assert from 'node:assert/strict'
import test from 'node:test'
import type { EvidenceItem, GameServerProfile, PlayerAction, PlayerDbProfile } from '$lib/core'
import { PlayerTimelinePreviewLoader } from './playerTimelinePreview.js'

const server = (id: number) => ({ gameServer: { id, name: `Server ${id}` } }) as GameServerProfile
const action = (id: number) => ({ id, playerId: 42, reason: `Reason ${id}` }) as PlayerAction

test(`evidence previews fetch the linked evidence independently of action IDs`, async () => {
  const evidenceIds: number[] = []
  const evidence = { id: 3, playerId: 42, nickname: `Knight` } as EvidenceItem
  const loader = new PlayerTimelinePreviewLoader(42, () => [action(3)], {
    server: async () => { throw new Error(`Unexpected server read`) },
    action: async () => { throw new Error(`Unexpected action read`) },
    evidence: async id => { evidenceIds.push(id); return evidence }
  })

  assert.deepEqual(await loader.get({ type: `evidence`, id: 3 }), { type: `evidence`, evidence })
  await loader.get({ type: `evidence`, id: 3 })
  assert.deepEqual(evidenceIds, [3])
})

test(`server previews read the linked server and refresh after the short cache window`, async () => {
  let now = 0
  const serverIds: number[] = []
  const loader = new PlayerTimelinePreviewLoader(42, () => [], {
    server: async id => { serverIds.push(id); return server(id) },
    action: async () => { throw new Error(`Unexpected action read`) }
  }, () => now)

  assert.deepEqual(await loader.get({ type: `server`, id: 7 }), { type: `server`, profile: server(7) })
  await loader.get({ type: `server`, id: 7 })
  await loader.get({ type: `server`, id: 8 })
  assert.deepEqual(serverIds, [7, 8])

  now = 31_000
  await loader.get({ type: `server`, id: 7 })
  assert.deepEqual(serverIds, [7, 8, 7])
})

test(`action previews use the exact linked action, fetching older actions when needed`, async () => {
  const actionIds: Array<[number, number]> = []
  const loader = new PlayerTimelinePreviewLoader(42, () => [action(3)], {
    server: async () => { throw new Error(`Unexpected server read`) },
    action: async (playerId, actionId) => {
      actionIds.push([playerId, actionId])
      return action(actionId)
    }
  })

  assert.deepEqual(await loader.get({ type: `action`, id: 3 }), { type: `action`, action: action(3) })
  assert.deepEqual(await loader.get({ type: `action`, id: 9 }), { type: `action`, action: action(9) })
  await loader.get({ type: `action`, id: 9 })
  assert.deepEqual(actionIds, [[42, 9]])
})

test(`failed previews can be retried`, async () => {
  let calls = 0
  const loader = new PlayerTimelinePreviewLoader(42, () => [], {
    server: async id => {
      if (++calls === 1) throw new Error(`Unavailable`)
      return server(id)
    },
    action: async () => { throw new Error(`Unexpected action read`) }
  })

  await assert.rejects(loader.get({ type: `server`, id: 7 }), /Unavailable/u)
  assert.deepEqual(await loader.get({ type: `server`, id: 7 }), { type: `server`, profile: server(7) })
  assert.equal(calls, 2)
})

test(`admin activity previews use the affected player's action endpoint`, async () => {
  const requested: Array<[number, number]> = []
  const loader = new PlayerTimelinePreviewLoader(42, () => [action(3)], {
    server: async () => { throw new Error(`Unexpected server read`) },
    action: async (playerId, actionId) => {
      requested.push([playerId, actionId])
      return { ...action(actionId), playerId }
    }
  })
  const preview = await loader.get({ type: `action`, id: 3, playerId: 77 })
  assert.equal(preview.type === `action` && preview.action.playerId, 77)
  assert.deepEqual(requested, [[77, 3]])
})

test(`cross-player hover previews load that player's offense history and refresh it`, async () => {
  let now = 0
  let reads = 0
  const affectedAction = { ...action(8), playerId: 77 }
  const history = [affectedAction, { ...action(9), playerId: 77, actionType: `unban`, relatedActionId: 8 } as PlayerAction]
  const loader = new PlayerTimelinePreviewLoader(42, () => [action(3)], {
    server: async () => assert.fail(`Unexpected server read`),
    action: async () => assert.fail(`The affected profile already contains the action`),
    profile: async () => {
      reads++
      return { player: { id: 77, playfabId: `VICTIM`, latestName: `Knight` }, actions: history } as unknown as PlayerDbProfile
    }
  }, () => now)
  const target = { type: `action` as const, id: 8, playerId: 77, playfabId: `VICTIM` }
  const preview = await loader.get(target)
  assert.deepEqual(preview.type === `action` && preview.actions, history)
  now = 31_000
  await loader.get(target)
  assert.equal(reads, 2)
})
