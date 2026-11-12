import assert from 'node:assert/strict'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { CommandObservationReporter } from './commandObservationReporter'
import type { CommandObservationFrame } from './commandHistoryService'
import type { CommandHistoryRow } from '../../shared/commandHistory/commandHistory'

function fixture() {
  let listener: (frame: CommandObservationFrame) => void = () => {}
  const calls: any[] = []
  const statuses: any[] = []
  let fail = false
  let slow = false
  let duplicate = false
  const releases: (() => void)[] = []
  const reporter = new CommandObservationReporter({
    subscribe: callback => { listener = callback; return () => { listener = () => {} } },
    post: async (input, signal) => {
      calls.push({ input: structuredClone(input), signal })
      if (slow) await new Promise<void>(resolve => releases.push(resolve))
      if (fail) throw new Error(`Offline`)
      return { id: input.id, status: duplicate ? `duplicate` : `recorded`, playerActionId: duplicate ? null : 17 }
    },
    status: status => statuses.push(status)
  })
  reporter.setUser(1)
  reporter.start()
  const frame = (count: number, origin: CommandHistoryRow[`origin`] = `external`, context = `server:1:0`, following = (_i: number) => [] as string[],
    command = (i: number) => `Adminsay test${i}`) => {
    listener({ context, rows: Array.from({ length: count }, (_, i) => ({ key: String(i), binding: { clientId: `client`, gameServerId: 1, generation: 0 },
      row: { id: i, index: i + 1, command: command(i), action: `Adminsay`, info: `test${i}`, origin,
        observedAtUtc: 10000, reason: ``, submission: null }, followingCommands: following(i) })) })
  }
  return { reporter, frame, calls, statuses, fail: (value: boolean) => { fail = value }, slow: () => { slow = true },
    duplicate: () => { duplicate = true }, release: () => releases.shift()?.() }
}

test(`reports all rows beyond the visible ten once with stable retry IDs`, async () => {
  const f = fixture()
  f.fail(true)
  f.frame(12)
  await setImmediate()
  assert.equal(f.calls.length, 1)
  const failed = f.calls[0].input
  f.fail(false)
  f.frame(12)
  await setImmediate()
  assert.equal(f.calls.length, 13)
  assert.deepEqual(f.calls[1].input, failed)
  f.frame(12)
  await setImmediate()
  assert.equal(f.calls.length, 13)
  f.reporter.stop()
})

test(`pending and unknown do not import; later origin correction reuses the frozen payload`, async () => {
  const f = fixture()
  f.frame(1, `pending`)
  f.frame(1, `unknown`)
  await setImmediate()
  assert.equal(f.calls.length, 0)
  f.frame(1)
  await setImmediate()
  f.frame(1, `spellbook`)
  await setImmediate()
  assert.equal(f.calls.length, 2)
  assert.deepEqual(f.calls[1].input, { ...f.calls[0].input, origin: `spellbook` })
  f.frame(1)
  await setImmediate()
  assert.equal(f.calls.length, 2)
  f.reporter.stop()
})

test(`slow uploads never overlap and account or server changes cancel pending delivery`, async () => {
  const f = fixture()
  f.slow()
  f.frame(4)
  f.frame(4)
  assert.equal(f.calls.length, 1)
  f.frame(1, `unknown`, `server:2:1`)
  assert.equal(f.calls[0].signal.aborted, true)
  f.release()
  await setImmediate()
  assert.equal(f.calls.length, 1)
  f.frame(1, `external`, `server:2:1`)
  assert.equal(f.calls.length, 2)
  f.reporter.setUser(2)
  assert.equal(f.calls[1].signal.aborted, true)
  f.release()
  await setImmediate()
  f.reporter.stop()
})

test(`only fifty history occurrences stay pending and eviction is reported`, async () => {
  const f = fixture()
  f.fail(true)
  f.frame(55)
  await setImmediate()
  assert.equal(f.statuses.at(-1).evicted, 5)
  assert.equal(f.statuses.at(-1).pending, 50)
  f.frame(55)
  await setImmediate()
  assert.equal(f.statuses.at(-1).evicted, 5)
  f.reporter.stop()
})

test(`following context is updated while queued, then frozen at first dispatch`, async () => {
  const f = fixture()
  f.slow()
  f.frame(2)
  f.frame(2, `external`, `server:1:0`, i => i === 1 ? [`BanById ABCD 1 later`] : [])
  f.release()
  await setImmediate()
  assert.deepEqual(f.calls[1].input.followingCommands, [`BanById ABCD 1 later`])
  f.reporter.stop()
  f.release()
})

test(`unrepresentable history stays diagnostic and cannot block later valid commands`, async () => {
  const f = fixture()
  const long = `x`.repeat(513)
  f.frame(2, `external`, `server:1:0`, () => [], i => i === 0 ? long : `Serversay valid`)
  await setImmediate()
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0].input.command, `Serversay valid`)
  assert.equal(f.statuses.at(-1).rows[0].status, `unreportable`)
  assert.equal(f.statuses.at(-1).pending, 0)
  f.reporter.stop()
})

test(`invalid following context cannot reject a valid message or falsely apply an unban`, async () => {
  const f = fixture()
  f.frame(2, `external`, `server:1:0`, () => [`x`.repeat(513)], i => i === 0 ? `Serversay valid` : `UnbanById ABCD`)
  await setImmediate()
  assert.equal(f.calls.length, 2)
  assert.ok(f.calls.every(call => call.input.followingCommands === undefined))
  f.reporter.stop()
})

test(`a lost message reply followed by duplicate acknowledgement is not mislabeled retained`, async () => {
  const f = fixture()
  f.fail(true)
  f.frame(1)
  await setImmediate()
  f.fail(false)
  f.duplicate()
  f.frame(1)
  await setImmediate()
  assert.equal(f.statuses.at(-1).rows[0].status, `duplicate`)
  assert.equal(f.statuses.at(-1).pending, 0)
  f.reporter.stop()
})
