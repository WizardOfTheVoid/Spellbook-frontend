import assert from 'node:assert/strict'
import test from 'node:test'
import { get } from 'svelte/store'
import type { PlayerAction } from '$lib/core'
import { createEvidenceOffenseEditor, evidenceOffenseOptions } from './evidenceOffenseEditor'

test(`offers only the same player's nonremoved bans, kicks, and warnings while retaining unavailable links`, () => {
  const options = evidenceOffenseOptions([
    action(1, `ban`), action(2, `kick`), action(3, `warn`), action(4, `unban`), action(5, `mock`),
    { ...action(6, `ban`), removedAt: `2026-09-28T12:00:00Z` }, { ...action(7, `ban`), playerId: 43 }
  ], 42, [6, 99])
  assert.deepEqual(options.map(option => option.value), [`1`, `2`, `3`, `6`, `99`])
  assert.equal(options.find(option => option.value === `6`)?.disabled, undefined)
})

test(`saving changes uses the explicit selection and prevents concurrent changes`, async () => {
  const pending = deferred<{ offenseIds: number[] }>()
  const writes: Array<[number, number[]]> = []
  const saved: number[][] = []
  const editor = createEvidenceOffenseEditor({ id: 11, playerId: 42, offenseIds: [99] }, {
    load: async () => [action(1, `ban`)],
    save: async (id, offenseIds) => {
      writes.push([id, offenseIds])
      return await pending.promise
    },
    onSaved: ids => saved.push(ids)
  })
  await editor.load()
  editor.setIds([1, 99])
  editor.syncIds([2])
  const saving = editor.save()
  editor.setIds([2])
  await editor.save()
  assert.deepEqual(writes, [[11, [1, 99]]])
  assert.deepEqual(get(editor).offenseIds, [1, 99])
  assert.equal(get(editor).saving, true)
  pending.resolve({ offenseIds: [99, 1] })
  await saving
  assert.deepEqual(saved, [[99, 1]])
  assert.equal(get(editor).saving, false)
  assert.equal(get(editor).dirty, false)
})

test(`failed saves keep the draft available for retry`, async () => {
  let attempts = 0
  const editor = createEvidenceOffenseEditor({ id: 11, playerId: 42, offenseIds: [] }, {
    load: async () => [action(1, `ban`)],
    save: async (_id, offenseIds) => {
      if (++attempts === 1) throw new Error(`Connection lost`)
      return { offenseIds }
    }
  })
  await editor.load()
  editor.setIds([1])
  await editor.save()
  assert.deepEqual(get(editor).offenseIds, [1])
  assert.equal(get(editor).dirty, true)
  assert.equal(get(editor).error, `Connection lost`)
  await editor.save()
  assert.equal(get(editor).dirty, false)
  assert.equal(get(editor).error, null)
})

test(`the latest offense load wins and an unmounted editor ignores pending saves`, async () => {
  const older = deferred<PlayerAction[]>()
  const newer = deferred<PlayerAction[]>()
  const pending = deferred<{ offenseIds: number[] }>()
  let loads = 0
  const saved: number[][] = []
  const editor = createEvidenceOffenseEditor({ id: 11, playerId: 42, offenseIds: [99] }, {
    load: async () => await (++loads === 1 ? older.promise : newer.promise),
    save: async () => await pending.promise,
    onSaved: ids => saved.push(ids)
  })
  const first = editor.load()
  const second = editor.load()
  newer.resolve([action(2, `warn`)])
  await second
  older.resolve([action(1, `ban`)])
  await first
  assert.deepEqual(get(editor).actions.map(item => item.id), [2])
  assert.deepEqual(get(editor).offenseIds, [99])
  editor.setIds([2])
  const saving = editor.save()
  editor.dispose()
  const before = get(editor)
  pending.resolve({ offenseIds: [2] })
  await saving
  assert.deepEqual(saved, [])
  assert.deepEqual(get(editor), before)
})

test(`an unmounted editor ignores pending offense loads`, async () => {
  const pending = deferred<PlayerAction[]>()
  const editor = createEvidenceOffenseEditor({ id: 11, playerId: 42, offenseIds: [99] }, {
    load: async () => await pending.promise,
    save: async (_id, offenseIds) => ({ offenseIds })
  })
  const loading = editor.load()
  editor.dispose()
  const before = get(editor)
  pending.resolve([action(1, `ban`)])
  await loading
  assert.deepEqual(get(editor), before)
})

function action(id: number, actionType: PlayerAction[`actionType`]): PlayerAction {
  return {
    id, playerId: 42, gameServerId: 7, authorId: 8, actionType, offenseType: `hacker`, duration: null,
    reason: null, scope: `local`, relatedActionId: null, autoban: false, originalActionId: null,
    expiresAt: null, createdAt: `2026-09-28T10:00:00Z`, updatedAt: `2026-09-28T10:00:00Z`,
    author: { id: 8, username: `Admin`, playfabId: null }, gameServer: { id: 7, name: `Server`, displayName: null }
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
