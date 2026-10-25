import assert from 'node:assert/strict'
import test from 'node:test'
import type { DbPlayerListItem, PlayerEntry } from '$lib/core'
import { createDbPlayerState, mergePlayerState } from './playerStateData'
import { prepareLocalPlayerSearch } from './localPlayerSearch'

const player = (id: number, name: string, names: string[] = []) => createDbPlayerState({
  id, playfabId: `${id.toString(16).toUpperCase().padStart(16, `0`)}`, latestName: name, names,
  lastLogin: null, playtimeHours: null, activeBanKind: null, isOnline: true
} as DbPlayerListItem)

test(`local search matches exact IDs without fuzzying an unknown ID into another player`, () => {
  const players = [player(0xabc, `Magic`), player(0xabd, `Gilgamesh`)]
  const search = prepareLocalPlayerSearch(players)
  assert.deepEqual(search.search(`0000000000000abc`).map(row => row.playfabId), [players[0]!.playfabId])
  assert.deepEqual(search.search(`0000000000000abe`), [])
})

test(`an ID-shaped miss matches current names and historical aliases while a real ID hit stays authoritative`, () => {
  const players = [player(1, `abcdef1234567`), player(2, `Current`, [`feedface12345`]), player(3, `0000000000000001`)]
  const search = prepareLocalPlayerSearch(players)
  assert.deepEqual(search.search(`ABCDEF1234567`).map(row => row.dbId), [1])
  assert.deepEqual(search.search(`FEEDFACE12345`).map(row => row.dbId), [2])
  assert.equal(search.search(`feedface12345`)[0]?.dbPlayer?.matchedAlias, `feedface12345`)
  assert.deepEqual(search.search(`0000000000000001`).map(row => row.dbId), [1])
  assert.deepEqual(search.search(`feedface12346`), [])
})

test(`local names use exact then prefix then substring matches across all aliases`, () => {
  const players = [player(1, `Old Magic`), player(2, `Magician`), player(3, `Magic`), player(4, `Current`, [`Magic Castle`])]
  const found = prepareLocalPlayerSearch(players).search(`magic`)
  assert.deepEqual(found.map(row => row.dbId), [3, 2, 4, 1])
  assert.equal(found[2]!.dbPlayer?.matchedAlias, `Magic Castle`)
  assert.equal(players[3]!.dbPlayer?.matchedAlias, undefined)
})

test(`local typo fallback and stylized normalization preserve action target identity`, () => {
  const players = [player(1, `Gilgamesh`), player(2, `𝕄𝔸𝔾𝕀ℂ`, [`Former Alias`]), player(3, `Other`)]
  const search = prepareLocalPlayerSearch(players)
  assert.deepEqual(search.search(`Gilgamseh`).map(row => row.playfabId), [players[0]!.playfabId])
  assert.deepEqual(search.search(`magic`).map(row => row.playfabId), [players[1]!.playfabId])
  assert.deepEqual(search.search(`Former Alias`).map(row => row.dbId), [2])
})

test(`local search treats regex punctuation as literal text and retains unknown live players`, () => {
  const unknown = mergePlayerState({ index: 7, name: `Guest [a+b]`, playfabId: ``, rawLine: `Guest [a+b]` } as PlayerEntry, null)
  const known = player(1, `Guest aaaaab`)
  const search = prepareLocalPlayerSearch([known, unknown])
  assert.deepEqual(search.search(`[a+b]`).map(row => row.name), [`Guest [a+b]`])
  assert.equal(search.search(`Guest [a+b]`)[0]!.index, 7)
  assert.deepEqual(search.search(``).map(row => row.name), [known.name, unknown.name])
})
