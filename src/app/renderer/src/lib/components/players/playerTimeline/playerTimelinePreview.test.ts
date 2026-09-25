import assert from 'node:assert/strict'
import test from 'node:test'
import type { GameServerProfile, PlayerAction } from '$lib/core'
import { PlayerTimelinePreviewLoader } from './playerTimelinePreview.js'

const server = (id: number) => ({ gameServer: { id, name: `Server ${id}` } }) as GameServerProfile
const action = (id: number) => ({ id, playerId: 42, reason: `Reason ${id}` }) as PlayerAction

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
