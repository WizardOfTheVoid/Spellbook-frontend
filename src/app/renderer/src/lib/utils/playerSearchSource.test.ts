import assert from 'node:assert/strict'
import test from 'node:test'
import { createPlayerArchiveSession, createPlayerArchiveSessionState, createPlayerQuery, defaultPlayerFilters } from './playerArchive'
import { parsePlayerPage } from './playersApi'
import { canSearchPlayerHistory } from './playerSearchSource'

const metadata = (searchSource: `id` | `opensearch` | `historic`, totalResults: number | null = 1) => ({
  currentPage: 1, pageSize: 100 as const, totalResults, totalPages: totalResults === null ? null : Math.ceil(totalResults / 100),
  hasPrevious: false, hasNext: false, searchSource
})

test(`engine results enable explicit historic search while IDs and history do not`, () => {
  assert.equal(canSearchPlayerHistory(metadata(`opensearch`)), true)
  for (const meta of [metadata(`opensearch`, 0), metadata(`id`), metadata(`historic`, null)]) {
    assert.equal(canSearchPlayerHistory(meta), false)
  }
})

test(`historic metadata and explicit historic requests preserve pagination`, () => {
  const meta = parsePlayerPage({ players: [], meta: metadata(`historic`, null) }).meta
  assert.equal(meta.searchSource, `historic`)
  const nextPage = createPlayerQuery({ page: 2, search: `Magic`, searchMode: `historic`, activeChipIds: [], filters: defaultPlayerFilters })
  assert.equal(nextPage.searchMode, `historic`)
  assert.equal(nextPage.page, 2)
})

test(`new normal query omits historic mode and metadata rejects unknown sources`, () => {
  const query = createPlayerQuery({ page: 1, search: `New name`, searchMode: `normal`, activeChipIds: [], filters: defaultPlayerFilters })
  assert.equal(query.searchMode, undefined)
  assert.throws(() => parsePlayerPage({ players: [], meta: { ...metadata(`opensearch`), searchSource: `random` } }), /metadata/u)
})

test(`historic navigation survives profile visits but is cleared for a different authenticated account`, () => {
  const session = createPlayerArchiveSession()
  const firstAccount = {}
  session.bind(firstAccount)
  session.save(createPlayerArchiveSessionState({
    page: 3, searchInput: `Old alias`, searchMode: `historic`, filters: defaultPlayerFilters,
    activeChipIds: [], advancedFiltersOpen: false
  }))
  assert.equal(session.bind(firstAccount).searchMode, `historic`)
  assert.equal(session.load().page, 3)
  assert.equal(session.bind({}).searchMode, undefined)
})
