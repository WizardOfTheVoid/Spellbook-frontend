import assert from 'node:assert/strict'
import test from 'node:test'
import { get } from 'svelte/store'
import type { GameServerListPage, GameServerRecord } from '../../../../core'
import { TelemetryServerSearch, telemetryServerTarget } from './telemetryServerSelection'

const server = { id: 7, name: `Observed server`, displayName: `Chosen server`, host: `192.0.2.1`,
  port: 7777, queryPort: 27015, deletedAt: null } as GameServerRecord

test(`server selection uses the exact gameplay endpoint and rejects unusable targets`, () => {
  assert.deepEqual(telemetryServerTarget(server), { id: 7, name: `Chosen server`, address: `192.0.2.1:7777` })
  assert.equal(telemetryServerTarget({ ...server, port: null }), null)
  assert.equal(telemetryServerTarget({ ...server, host: `invalid` }), null)
  assert.equal(telemetryServerTarget({ ...server, deletedAt: `2026-10-20` }), null)
})

test(`server searches request one page and discard stale or unmounted responses`, async () => {
  const requests: unknown[] = []
  const pending: ((page: GameServerListPage) => void)[] = []
  const search = new TelemetryServerSearch(async query => {
    requests.push(query)
    return new Promise(resolve => pending.push(resolve))
  })
  const page = { servers: [server], meta: { currentPage: 1, pageSize: 100, totalPages: 2, totalResults: 101, hasPrevious: false, hasNext: true } } as GameServerListPage
  const first = search.load(`old`, 1)
  const second = search.load(`new`, 2)
  pending[1]({ ...page, meta: { ...page.meta, currentPage: 2, hasPrevious: true, hasNext: false } })
  await second
  pending[0](page)
  await first
  assert.deepEqual(requests, [
    { search: `old`, page: 1, deleted: `active`, includeMainMenu: false, sortBy: `alphabetical`, sortOrder: `asc` },
    { search: `new`, page: 2, deleted: `active`, includeMainMenu: false, sortBy: `alphabetical`, sortOrder: `asc` }
  ])
  assert.equal(get(search.view).page, 2)
  const third = search.load(`late`, 1)
  search.dispose()
  pending[2](page)
  await third
  assert.equal(get(search.view).page, 2)
})
