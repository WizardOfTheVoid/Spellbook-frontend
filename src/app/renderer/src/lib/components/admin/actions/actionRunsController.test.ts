import assert from 'node:assert/strict'
import test from 'node:test'
import { ActionRunsController, type ActionRunsPage } from './actionRunsController'

function result(page: number, total = 121): ActionRunsPage {
  return { paused: false, runs: [], meta: { currentPage: page, pageSize: 50, totalPages: Math.ceil(total / 50), totalResults: total, hasPrevious: page > 1, hasNext: page * 50 < total } }
}

test(`page navigation retains filters and changing filters starts at page one`, async () => {
  const queries: unknown[] = []
  const controller = new ActionRunsController(async query => {
    queries.push(query)
    return result(Number(query.page))
  })
  await controller.load({ status: `failed`, mock: `false` }, 2)
  assert.equal(controller.state.meta.currentPage, 2)
  await controller.load({ status: `completed` })
  assert.deepEqual(queries, [{ status: `failed`, mock: `false`, page: `2` }, { status: `completed`, page: `1` }])
  assert.equal(controller.state.meta.currentPage, 1)
})

test(`an older response cannot replace a newer filter result`, async () => {
  let resolve!: (page: ActionRunsPage) => void
  const pending = new Promise<ActionRunsPage>(done => { resolve = done })
  const controller = new ActionRunsController(async query => query.status === `failed` ? await pending : result(1, 0))
  const older = controller.load({ status: `failed` }, 2)
  await controller.load({ status: `completed` })
  resolve(result(2))
  await older
  assert.equal(controller.state.meta.totalResults, 0)
  assert.equal(controller.state.meta.currentPage, 1)
  assert.equal(controller.state.loading, false)
})

test(`failed page requests keep the current page and expose a retryable error`, async () => {
  const controller = new ActionRunsController(async query => {
    if (query.page === `2`) throw new Error(`Offline`)
    return result(1)
  })
  await controller.load({})
  await controller.load({}, 2)
  assert.equal(controller.state.meta.currentPage, 1)
  assert.equal(controller.state.error, `Offline`)
  assert.equal(controller.state.loading, false)
  await controller.load({})
  assert.equal(controller.state.error, ``)
})
