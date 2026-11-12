import assert from 'node:assert/strict'
import test from 'node:test'
import type { PlayerListMeta } from '../../utils/playersApi'
import { createPlayerResultBatches } from './playerResultBatches.js'

const batch = (currentPage: number, players: { id: number, actionId: number }[], hasNext = true, searchSource: PlayerListMeta[`searchSource`] = `opensearch`) => ({
  players, meta: { currentPage, pageSize: 100 as const, totalPages: null, totalResults: null, hasPrevious: currentPage > 1, hasNext, searchSource }
})

test(`appends in server order and updates duplicate player action metadata in place`, () => {
  const results = createPlayerResultBatches<{ id: number, actionId: number }>()
  results.reset(`wanted:admin1`)
  assert.equal(results.begin(`wanted:admin1`), 1)
  assert.equal(results.accept(`wanted:admin1`, batch(1, [{ id: 2, actionId: 20 }, { id: 1, actionId: 10 }])), true)
  assert.equal(results.begin(`wanted:admin1`), 2)
  results.accept(`wanted:admin1`, batch(2, [{ id: 1, actionId: 11 }, { id: 3, actionId: 30 }]))
  assert.equal(results.begin(`wanted:admin1`), 3)
  results.accept(`wanted:admin1`, batch(3, [{ id: 4, actionId: 40 }], false))
  assert.deepEqual(results.snapshot().players, [{ id: 2, actionId: 20 }, { id: 1, actionId: 11 }, { id: 3, actionId: 30 }, { id: 4, actionId: 40 }])
  assert.equal(results.begin(`wanted:admin1`), null)
})

test(`repeated load triggers issue one page and retry the failed page without losing earlier rows`, () => {
  const results = createPlayerResultBatches<{ id: number, actionId: number }>()
  results.reset(`q`)
  assert.equal(results.begin(`q`), 1)
  assert.equal(results.begin(`q`), null)
  results.accept(`q`, batch(1, [{ id: 1, actionId: 10 }]))
  assert.equal(results.begin(`q`), 2)
  results.fail(`q`, `offline`)
  assert.equal(results.begin(`q`), null)
  assert.deepEqual(results.snapshot().players, [{ id: 1, actionId: 10 }])
  assert.equal(results.begin(`q`, true), 2)
  results.accept(`q`, batch(2, [{ id: 2, actionId: 20 }], false))
  assert.equal(results.snapshot().error, null)
})

test(`query, source and account resets reject stale pages and failures`, () => {
  const results = createPlayerResultBatches<{ id: number, actionId: number }>()
  for (const key of [`players:admin1:a`, `wanted:admin1:a`, `wanted:admin2:b`]) {
    results.reset(key)
    assert.equal(results.accept(`old`, batch(1, [{ id: 7, actionId: 77 }])), false)
    assert.equal(results.fail(`old`, `late error`), false)
    assert.deepEqual(results.snapshot().players, [])
    assert.equal(results.begin(key), 1)
  }
})

test(`trusts hasNext after short duplicate batches and pins automatic historic fallback`, () => {
  const results = createPlayerResultBatches<{ id: number, actionId: number }>()
  results.reset(`q`)
  results.begin(`q`)
  results.accept(`q`, batch(1, [{ id: 1, actionId: 10 }], true, `historic`))
  assert.equal(results.snapshot().meta?.searchSource, `historic`)
  assert.equal(results.begin(`q`), 2)
  results.accept(`q`, batch(2, [{ id: 1, actionId: 11 }], true, `historic`))
  assert.equal(results.begin(`q`), 3)
})

test(`stops indexed batches before page 101 even when the exact total is larger`, () => {
  const results = createPlayerResultBatches<{ id: number, actionId: number }>()
  results.reset(`q`)
  for (let page = 1; page <= 100; page++) {
    assert.equal(results.begin(`q`), page)
    results.accept(`q`, batch(page, [{ id: page, actionId: page }]))
  }
  assert.equal(results.begin(`q`), null)
  assert.equal(results.snapshot().windowReached, true)
})

test(`restores the current query depth without replay and resumes after cancellation`, () => {
  const results = createPlayerResultBatches<{ id: number, actionId: number }>()
  results.reset(`q`)
  results.begin(`q`)
  results.accept(`q`, batch(1, [{ id: 1, actionId: 10 }]))
  results.begin(`q`)
  results.cancel()
  assert.equal(results.begin(`q`), 2)
  const restored = createPlayerResultBatches<{ id: number, actionId: number }>()
  restored.reset(`q`, results.snapshot())
  assert.equal(restored.begin(`q`), 2)
  assert.deepEqual(restored.snapshot().players, [{ id: 1, actionId: 10 }])
})
