import assert from 'node:assert/strict'
import test from 'node:test'
import type { DbPlayerListItem } from '$lib/core'
import { createEvidencePlayerSearch, type EvidencePlayerSearchState } from './playerSearch'

test(`requests no players until the user enters a nonempty search`, async context => {
  context.mock.timers.enable({ apis: [`setTimeout`] })
  const searches: string[] = []
  const search = createEvidencePlayerSearch(async query => {
    searches.push(query)
    return []
  }, () => {})
  search.update(`  `)
  context.mock.timers.tick(1000)
  assert.deepEqual(searches, [])
  search.update(`  Samwise  `)
  context.mock.timers.tick(249)
  assert.deepEqual(searches, [])
  context.mock.timers.tick(1)
  assert.deepEqual(searches, [`Samwise`])
  search.cancel()
})

test(`clearing search cancels pending work and ignores an in-flight response`, async context => {
  context.mock.timers.enable({ apis: [`setTimeout`] })
  let resolve: (players: DbPlayerListItem[]) => void = () => {}
  const result = new Promise<DbPlayerListItem[]>(done => resolve = done)
  let calls = 0
  const states: EvidencePlayerSearchState[] = []
  const search = createEvidencePlayerSearch(async () => {
    calls += 1
    return await result
  }, state => states.push(state))
  search.update(`Sam`)
  search.update(``)
  context.mock.timers.tick(250)
  assert.equal(calls, 0)
  search.update(`Samwise`)
  context.mock.timers.tick(250)
  assert.equal(states.at(-1)?.searching, true)
  search.update(``)
  resolve([{ id: 42, playfabId: `ABC123`, latestName: `Samwise`, lastLogin: null, playtimeHours: null, activeBanKind: null, isOnline: false }])
  await result
  await Promise.resolve()
  assert.deepEqual(states.at(-1), { players: [], searching: false, error: null })
  search.cancel()
})

test(`a newer query immediately invalidates an older result and error`, async context => {
  context.mock.timers.enable({ apis: [`setTimeout`] })
  let reject: (error: Error) => void = () => {}
  const oldResult = new Promise<DbPlayerListItem[]>((_resolve, fail) => reject = fail)
  const states: EvidencePlayerSearchState[] = []
  const search = createEvidencePlayerSearch(async query => query === `old` ? await oldResult : [], state => states.push(state))
  search.update(`old`)
  context.mock.timers.tick(250)
  search.update(`new`)
  reject(new Error(`Old query failed`))
  await oldResult.catch(() => {})
  await Promise.resolve()
  assert.deepEqual(states.at(-1), { players: [], searching: false, error: null })
  search.cancel()
})
