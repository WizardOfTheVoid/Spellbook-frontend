import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import test from 'node:test'
import { executeLocalAction } from './localActionReporter'
import type { LocalActionReport } from '@spellbook/shared/actionEvents'
import type { CoreCallResult } from '../../types'

const action = { label: `Say`, iconKey: `circle-info` as const, commands: [{ commandType: `server_message` as const, message: `Welcome` }] }
const input = { coreActionId: `native-1`, gameServerId: 3, target: { type: `server` as const }, action }
const native = (data: unknown): CoreCallResult => ({ ok: true, status: 200, statusText: `OK`, data: { data } })

test(`local reporting preserves native results, stable identity and the original server`, async () => {
  const reports: LocalActionReport[] = []
  let calls = 0
  const http = { authenticatedEpoch: 1, postServer: async (_path: string, report: unknown) => {
    reports.push(report as LocalActionReport)
    return native({})
  } }
  const result = native({ status: `completed`, sentCommands: 1 })
  assert.equal(await executeLocalAction(http, input, async () => { calls++
    return result }), result)
  await setImmediate()
  assert.equal(calls, 1)
  assert.equal(reports[0].gameServerId, 3)
  assert.equal(reports[0].coreActionId, `native-1`)
  assert.equal(reports[0].status, `completed`)
})

test(`a lost native result stays unknown and a failed upload never repeats execution`, async t => {
  t.mock.method(console, `warn`, () => {})
  const reports: LocalActionReport[] = []
  let executions = 0
  const http = { authenticatedEpoch: 1, postServer: async (_path: string, report: unknown) => {
    reports.push(report as LocalActionReport)
    throw new Error(`Offline`)
  } }
  const timeout = { ok: false, status: 0, statusText: `TIMEOUT`, data: null }
  assert.equal(await executeLocalAction(http, input, async () => { executions++
    return timeout }), timeout)
  await setImmediate()
  assert.equal(executions, 1)
  assert.equal(reports[0].status, `unknown`)
  assert.equal(reports[0].sentCommands, null)
})

test(`account switches discard the previous account's result and preparation failures create no event`, async () => {
  let reports = 0
  const http = { authenticatedEpoch: 1, postServer: async () => { reports++
    return native({}) } }
  await executeLocalAction(http, input, async () => { http.authenticatedEpoch = 2
    return native({ status: `failed`, sentCommands: 0 }) })
  await assert.rejects(() => executeLocalAction(http, input, async () => { throw new RangeError(`Missing variable`) }), RangeError)
  await setImmediate()
  assert.equal(reports, 0)
})
