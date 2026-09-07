import assert from 'node:assert/strict'
import test from 'node:test'
import type { AuditLogPage, AuditLogQuery, AuditLogRecord } from '$lib/core'

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

test('builds only allowlisted filters with exact UTC day bounds', async () => {
  const module = await import('./auditLogsController.js').catch(() => ({}))
  const query = Reflect.get(module, 'auditLogQuery')
  assert.ok(query)

  assert.deepEqual(query({
    eventType: ' wanted.executed ',
    actorId: '7',
    targetType: ' player ',
    targetId: ' PF-1 ',
    gameServerId: '9',
    outcome: ' success ',
    createdFrom: '2026-08-30',
    createdTo: '2026-08-31',
    ignored: 'never forwarded'
  }), {
    eventType: 'wanted.executed',
    actorId: 7,
    targetType: 'player',
    targetId: 'PF-1',
    gameServerId: 9,
    outcome: 'success',
    createdFrom: '2026-08-30T00:00:00.000Z',
    createdTo: '2026-08-31T23:59:59.999Z',
    limit: 50
  })
})

test('rejects invalid numeric and UTC date filters instead of widening the query', async () => {
  const { auditLogQuery } = await import('./auditLogsController.js')
  assert.throws(() => auditLogQuery({ actorId: '0' }), /actor/i)
  assert.throws(() => auditLogQuery({ gameServerId: '4.2' }), /server/i)
  assert.throws(() => auditLogQuery({ createdFrom: '2026-02-30' }), /date/i)
})

test('loads newest-first pages and deduplicates cursor overlap', async () => {
  const { AuditLogsController } = await import('./auditLogsController.js')
  const calls: unknown[] = []
  const pages = [
    page([log(9), log(11)], 8),
    page([log(8), log(9)], null)
  ]
  const controller = new AuditLogsController({
    list: async (query: unknown) => {
      calls.push(query)
      return pages.shift()!
    }
  })
  controller.setContext(3, true)

  await controller.reset({ eventType: 'wanted.executed' })
  await controller.loadMore()

  assert.deepEqual(controller.state.logs.map((item: AuditLogRecord) => item.id), [11, 9, 8])
  assert.equal(controller.state.nextBeforeId, null)
  assert.deepEqual(calls, [
    { eventType: 'wanted.executed', limit: 50 },
    { eventType: 'wanted.executed', beforeId: 8, limit: 50 }
  ])
})

test('filter reset invalidates an older load-more before clearing rows', async () => {
  const { AuditLogsController } = await import('./auditLogsController.js')
  const oldMore = deferred<AuditLogPage>()
  const controller = new AuditLogsController({
    list: async (query: AuditLogQuery = {}) => {
      if (query.beforeId) return oldMore.promise
      return query.eventType === 'old' ? page([log(10)], 9) : page([log(20)], null)
    }
  })
  controller.setContext(3, true)
  await controller.reset({ eventType: 'old' })
  const stale = controller.loadMore()

  await controller.reset({ eventType: 'new' })
  oldMore.resolve(page([log(9)], null))
  await stale

  assert.deepEqual(controller.state.logs.map((item: AuditLogRecord) => item.id), [20])
  assert.equal(controller.state.loading, false)
})

test('logout and destroy ignore stale pages and release loading state', async () => {
  const { AuditLogsController } = await import('./auditLogsController.js')
  const pending = deferred<AuditLogPage>()
  const controller = new AuditLogsController({ list: async () => pending.promise })
  controller.setContext(3, true)
  const load = controller.reset({})

  controller.setContext(null, false)
  pending.resolve(page([log(7)], null))
  await load
  assert.deepEqual(controller.state.logs, [])
  assert.equal(controller.state.loading, false)

  controller.destroy()
  assert.equal(await controller.loadMore(), null)
})

test('load more is single-flight for one generation and cursor', async () => {
  const { AuditLogsController } = await import('./auditLogsController.js')
  const more = deferred<AuditLogPage>()
  let calls = 0
  const controller = new AuditLogsController({
    list: async (query: AuditLogQuery = {}) => {
      calls += 1
      return query.beforeId ? more.promise : page([log(10)], 9)
    }
  })
  controller.setContext(3, true)
  await controller.reset({})

  const first = controller.loadMore()
  const second = controller.loadMore()
  more.resolve(page([log(9)], null))
  await Promise.all([first, second])

  assert.equal(calls, 2)
})

function page(logs: AuditLogRecord[], nextBeforeId: number | null): AuditLogPage {
  return { logs, nextBeforeId }
}

function log(id: number): AuditLogRecord {
  return {
    id,
    eventType: 'wanted.executed',
    outcome: 'success',
    actorId: 3,
    targetType: 'player',
    targetId: 'PF-1',
    gameServerId: 9,
    correlationId: null,
    meta: { actionType: 'ban' },
    createdAt: `2026-08-31T12:00:00.000Z`
  }
}
