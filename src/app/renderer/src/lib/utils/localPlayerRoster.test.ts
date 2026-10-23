import assert from 'node:assert/strict'
import test from 'node:test'
import type { DbPlayerListItem } from '$lib/core'
import { createLocalPlayerRoster, prepareLocalPlayerRoster } from './localPlayerRoster'
import { createDbPlayerState, mergePlayerState } from './playerStateData'
import { defaultPlayerFilters } from './playerArchive'
import type { PlayerListMeta, PlayerPage } from './playersApi'

const dbPlayer = (id: number, name: string, names: string[] = []): DbPlayerListItem => ({
  id, playfabId: id.toString(16).padStart(16, `0`), latestName: name, names,
  lastLogin: null, playtimeHours: null, activeBanKind: null, isOnline: true, rank: id
})
const emptyMeta: PlayerListMeta = { currentPage: 1, pageSize: 100, totalPages: 0, totalResults: 0, hasPrevious: false, hasNext: false }

test(`typing filters and paging use one complete enriched roster without search HTTP requests`, async () => {
  const requests: unknown[] = []
  const rows = Array.from({ length: 60 }, (_, index) => dbPlayer(index + 1, `Current ${index}`, [`Alias ${index}`]))
  const roster = { players: rows.map(createDbPlayerState), state: `ok` as const, error: null, refreshedAt: `now` }
  const controller = createLocalPlayerRoster(async query => {
    requests.push(query)
    return { players: rows, meta: emptyMeta }
  }, () => {})
  const prepared = await controller.read(roster, 1)
  assert.equal(await controller.read(roster, 1), prepared)
  assert.equal(requests.length, 1)
  assert.deepEqual(requests[0], { include: rows.map(row => row.playfabId).sort() })
  assert.equal(prepared.query(`Alias 59`, [], defaultPlayerFilters, 1).players[0].playfabId, rows[59]!.playfabId)
  const filtered = prepared.query(`Alias`, [], { ...defaultPlayerFilters, minRank: 60 }, 1)
  assert.equal(filtered.meta.totalResults, 1)
  assert.equal(filtered.rosterPlayers.length, 60)
  assert.equal(prepared.query(``, [], defaultPlayerFilters, 2).players.length, 0)
  assert.equal(requests.length, 1)
})

test(`account or server reset rejects stale enrichment and preserves unknown live action identities`, async () => {
  const pending = Promise.withResolvers<PlayerPage>()
  let requests = 0
  const controller = createLocalPlayerRoster(async () => { requests++; return pending.promise }, () => {})
  const known = createDbPlayerState(dbPlayer(1, `Known`))
  const old = controller.read({ players: [known], state: `ok`, error: null, refreshedAt: `old` }, 1)
  controller.reset()
  pending.resolve({ players: [dbPlayer(1, `Other account alias`)], meta: emptyMeta })
  await assert.rejects(old, { name: `AbortError` })
  const unknown = { ...mergePlayerState({ index: 7, name: `Guest`, playfabId: ``, rawLine: `guest` }, null), liveKey: `live-7`, identity: `unknown` as const }
  const current = await controller.read({ players: [unknown], state: `ok`, error: null, refreshedAt: `new` }, 2)
  const result = current.query(`Guest`, [], defaultPlayerFilters, 1)
  assert.equal(requests, 1)
  assert.equal(result.players[0].index, 7)
  assert.equal(result.players[0].liveKey, `live-7`)
  assert.equal(result.players[0].playfabId, ``)
})

test(`silent roster refresh retains aliases while applying current membership and observations`, () => {
  const original = mergePlayerState({ index: 1, name: `Known`, playfabId: `0000000000000001`, rawLine: `known`, kills: 2 },
    dbPlayer(1, `Known`, [`AncientDragon`]))
  const departed = mergePlayerState({ index: 2, name: `Departed`, playfabId: ``, rawLine: `departed` }, null)
  const cached = prepareLocalPlayerRoster({ players: [original, departed], state: `ok`, error: null, refreshedAt: `old` })
  const changed = { ...mergePlayerState({ ...original.livePlayer!, name: `Current Known`, kills: 7 }, dbPlayer(1, `Current Known`)),
    dbPlayer: { ...dbPlayer(1, `Current Known`), names: undefined, rank: 20 } }
  const joined = mergePlayerState({ index: 3, name: `New Guest`, playfabId: ``, rawLine: `new guest` }, null)
  const incoming = { players: [changed, joined], state: `ok` as const, error: null, refreshedAt: `new` }
  const refreshed = cached.refresh(incoming)
  const aliasResult = refreshed.query(`AncientDragon`, [], defaultPlayerFilters, 1)
  assert.deepEqual(aliasResult.players.map(player => [player.playfabId, player.name, player.kills, player.rank]),
    [[`0000000000000001`, `Current Known`, 7, 20]])
  assert.deepEqual(refreshed.query(``, [], defaultPlayerFilters, 1).players.map(player => player.name), [`Current Known`, `New Guest`])
  assert.equal(refreshed.query(`Departed`, [], defaultPlayerFilters, 1).players.length, 0)
  assert.equal(changed.dbPlayer.names, undefined)
  assert.equal(original.kills, 2)
})
