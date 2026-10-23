import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareLocalPlayerRoster } from './localPlayerRoster'
import { createDbPlayerState } from './playerStateData'
import { defaultPlayerFilters } from './playerArchive'

test(`60-player alias-rich matching filtering and sorting stays below 20 ms p95`, () => {
  const players = Array.from({ length: 60 }, (_, index) => createDbPlayerState({
    id: index + 1, playfabId: index.toString(16).padStart(16, `0`), latestName: `Player ${index} Gilgamesh`,
    names: Array.from({ length: 40 }, (_, alias) => `Clan ${alias} Veteran ${index} Historical Nickname`),
    rank: index * 20, lastLogin: null, playtimeHours: index * 30, isOnline: true, activeBanKind: null
  }))
  const roster = prepareLocalPlayerRoster({ players, state: `ok`, error: null, refreshedAt: null })
  const queries = [`Gilgamesh`, `Veteran 45`, `Gilgamseh`, `Nobody matching qzx`, players[37]!.playfabId]
  const filters = { ...defaultPlayerFilters, minRank: 20, sortBy: `rank` as const }
  const timings: number[] = []
  for (let index = 0; index < 600; index++) {
    const started = performance.now()
    roster.query(queries[index % queries.length]!, [], filters, 1)
    if (index >= 100) timings.push(performance.now() - started)
  }
  timings.sort((left, right) => left - right)
  const p95 = timings[Math.ceil(timings.length * 0.95) - 1]!
  console.log(`Local search: ${players.length} players, 2400 historical aliases, ${timings.length} samples, p95 ${p95.toFixed(2)} ms`)
  assert.ok(p95 < 20, `p95 ${p95.toFixed(2)} ms exceeds 20 ms`)
})
