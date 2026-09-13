import assert from 'node:assert/strict'
import test from 'node:test'
import { createDebugPresets } from '../../shared/debugPresets'
import type { CoreCallResult } from '../types'
import { deferred, envelope, flush, harness, snapshot, unavailable } from './debugTestHarness'

test(`enabling Debug arms tests automatically and disabling it disarms Core`, async () => {
  const h = harness()
  await h.session.setEnabled(true)
  assert.equal((await h.session.getState()).armed, true)
  assert.equal(h.core.armed, true)
  h.core.sequence = 1
  h.core.events = [{ sequence: 1, timeMs: 1100, kind: `shortcut`, slot: 1, message: `press` }]
  await h.advance(100)
  assert.equal(h.requests.filter(request => request.path === `/v3/actions`).length, 1)
  await h.session.setEnabled(false)
  assert.equal(h.core.armed, false)
})

test(`physical key and button events are excluded from snapshots, history and recordings`, async () => {
  const h = harness()
  await h.session.setEnabled(true)
  await h.session.record(true)
  h.core.sequence = 3
  h.core.events = [
    { sequence: 1, timeMs: 1100, kind: `physical_key`, message: `78 down` },
    { sequence: 2, timeMs: 1101, kind: `physical_button`, message: `1 down` },
    { sequence: 3, timeMs: 1102, kind: `queued`, message: `Action queued` }
  ]
  await h.advance(100)
  const state = await h.session.getState()
  assert.deepEqual(state.core?.events.map(event => event.kind), [`queued`])
  assert.deepEqual(state.events.map(event => event.kind), [`queued`])
  assert.equal(state.core?.sequence, 3)
  assert.doesNotMatch(await h.session.exportRecording(), /physical_(key|button)/u)
})

test(`preview is the next serialized Action and every later run receives a fresh identity`, async () => {
  const h = harness()
  await h.session.setEnabled(true)
  const preset = createDebugPresets(`F6`)[0]!
  const preview = await h.session.preview(preset)
  await h.session.run(1)
  await h.session.run(1)
  await flush()
  const actions = h.requests.filter(request => request.path === `/v3/actions`).map(request => request.body)
  assert.deepEqual(actions[0], preview)
  assert.notEqual(actions[0].id, actions[1].id)
  assert.notEqual(actions[0].key, actions[1].key)
  const command = actions[0].commands[0]
  assert.equal(command.type, `console`)
  if (command.type === `console`) assert.equal(command.command, `ListPlayers`)
  assert.equal((await h.session.getState()).runs[0]?.state, `completed`)
})

test(`matching repeats retain replacement key but use fresh IDs and cancellable countdowns`, async () => {
  const h = harness()
  await h.session.setEnabled(true)
  await h.session.savePreset({ ...createDebugPresets()[0]!, slot: 2, identity: `matching`, startDelayMs: 300, intervalMs: 100, repeat: 3 })
  await h.session.run(2)
  assert.equal(h.requests.filter(request => request.path === `/v3/actions`).length, 0)
  await h.advance(300)
  await h.advance(100)
  const actions = h.requests.filter(request => request.path === `/v3/actions`).map(request => request.body)
  assert.equal(actions.length, 2)
  assert.notEqual(actions[0].id, actions[1].id)
  assert.equal(actions[0].key, actions[1].key)
  await h.session.stop()
  await h.advance(1000)
  assert.equal(h.requests.filter(request => request.path === `/v3/actions`).length, 2)
})

test(`numpad 2 toggles numbered ServerSay every 250ms beyond the finite repeat limit`, async () => {
  const h = harness()
  await h.session.setEnabled(true)
  const preview = await h.session.preview(createDebugPresets(`F6`)[1]!)
  const actions = () => h.requests.filter(request => request.path === `/v3/actions`).map(request => request.body)
  await h.session.run(2)
  assert.deepEqual(actions()[0], preview)
  assert.equal(actions()[0].commands[0].command, `ServerSay "Dev test - 250ms - #1"`)
  assert.equal(actions()[0].commands[0].consoleKey, `F6`)
  assert.equal(actions()[0].commands[0].delayMs, 250)
  await h.advance(249)
  assert.equal(actions().length, 1)
  await h.advance(1)
  assert.equal(actions()[1].commands[0].command, `ServerSay "Dev test - 250ms - #2"`)
  for (let count = 0; count < 100; count++) await h.advance(250)
  assert.equal(actions()[101].commands[0].command, `ServerSay "Dev test - 250ms - #102"`)
  await h.session.run(2)
  await h.advance(1000)
  assert.equal(actions().length, 102)
  assert.equal((await h.session.getState()).scheduled?.length, 0)
  await h.session.run(2)
  assert.equal(actions()[102].commands[0].command, `ServerSay "Dev test - 250ms - #1"`)
  await h.session.stop()
  await h.advance(1000)
  assert.equal(actions().length, 103)
})

test(`toggling numpad 2 off cancels its queued Actions while preserving other tests`, async () => {
  const h = harness()
  const pending = deferred<CoreCallResult>()
  h.responses.action = async () => pending.promise
  await h.session.setEnabled(true)
  await h.session.run(1)
  await h.session.run(2)
  await h.advance(250)
  const before = await h.session.getState()
  assert.deepEqual(before.runs.filter(run => run.slot === 2).map(run => run.request.commands[0]?.delayMs), [250, 250])
  await h.session.run(2)
  const cancelled = h.requests.filter(request => request.body?.operation === `cancel`).map(request => request.body.id)
  assert.deepEqual(cancelled, before.runs.filter(run => run.slot === 2).map(run => run.id))
  assert.equal(cancelled.length, 2)
  assert.ok(!cancelled.includes(before.runs.find(run => run.slot === 1)!.id))
  pending.resolve(envelope({ status: `cancelled`, sentCommands: 0 }))
  await flush()
  await h.session.stop()
})

test(`polling never overlaps and skips historical or duplicate shortcuts`, async () => {
  const h = harness()
  h.core.sequence = 4
  h.core.events = [{ sequence: 4, timeMs: 100, kind: `shortcut`, slot: 1, message: `old` }]
  await h.session.setEnabled(true)
  assert.equal(h.requests.filter(request => request.path === `/v3/actions`).length, 0)
  await h.session.setArmed(true)
  h.core.sequence = 5
  h.core.events.push({ sequence: 5, timeMs: 1100, kind: `shortcut`, slot: 1, message: `new` })
  await h.advance(100)
  await h.advance(100)
  assert.equal(h.requests.filter(request => request.path === `/v3/actions`).length, 1)
  const pending = deferred<CoreCallResult>()
  h.responses.get = () => pending.promise
  await h.advance(100)
  const count = h.requests.length
  await h.advance(1000)
  assert.equal(h.requests.length, count)
  pending.resolve(envelope(h.core))
  await flush()
  assert.equal(h.timers.size, 1)
})

test(`disable releases owned state and preserves the original partial cancellation result`, async () => {
  const h = harness()
  const pending = deferred<CoreCallResult>()
  h.responses.action = () => pending.promise
  await h.session.setEnabled(true)
  await h.session.setArmed(true)
  await h.session.setProducerPaused(`listPlayers`, true)
  await h.session.queue(`pause`)
  await h.session.settings({ ActionLowTtlMs: 50 })
  await h.session.run(1)
  const id = (await h.session.getState()).runs[0]!.id
  h.responses.mutation = async () => envelope({ found: true })
  await h.session.setEnabled(false)
  assert.equal(h.requests.find(request => request.path === `/v3/actions`)?.signal?.aborted, false)
  assert.ok(h.requests.some(request => request.body?.operation === `cancel` && request.body.id === id))
  assert.ok(h.requests.some(request => request.body?.operation === `resume`))
  assert.ok(h.requests.some(request => request.path === `/v3/debug/settings` && request.body.reset))
  assert.deepEqual(h.producerChanges.at(-1), { producer: `listPlayers`, paused: false })
  pending.resolve({ ok: false, status: 409, statusText: `Conflict`, data: { ok: false, data: { status: `cancelled`, sentCommands: 1, commandResults: [{ index: 0, sent: true }] } } })
  await flush()
  const state = await h.session.getState()
  assert.equal(state.enabled, false)
  assert.equal(state.armed, false)
  assert.equal(state.runs[0]!.state, `cancelled`)
  assert.equal((state.runs[0]!.result as CoreCallResult).data && ((state.runs[0]!.result as CoreCallResult).data as any).data.sentCommands, 1)
  assert.equal(h.timers.size, 0)
})

test(`disconnect disarms and reconnect automatically rearms without replaying buffered shortcuts`, async () => {
  const h = harness()
  await h.session.setEnabled(true)
  await h.session.setArmed(true)
  await h.session.setProducerPaused(`wanted`, true)
  h.responses.get = async () => unavailable()
  await h.advance(100)
  assert.equal((await h.session.getState()).armed, false)
  assert.deepEqual(h.producerChanges.at(-1), { producer: `wanted`, paused: false })
  h.responses.get = undefined
  h.core.armed = true
  h.core.sequence = 8
  h.core.events = [{ sequence: 8, timeMs: 1100, kind: `shortcut`, slot: 1, message: `buffered` }]
  await h.advance(100)
  assert.equal(h.requests.filter(request => request.path === `/v3/actions`).length, 0)
  assert.equal((await h.session.getState()).armed, true)
})

test(`stale poll and arm replies cannot reactivate a disabled session`, async () => {
  const h = harness()
  const poll = deferred<CoreCallResult>()
  h.responses.get = () => poll.promise
  const enabling = h.session.setEnabled(true)
  await h.session.setEnabled(false)
  const late = snapshot()
  late.armed = true
  poll.resolve(envelope(late))
  await enabling
  assert.equal((await h.session.getState()).core, null)
  assert.equal((await h.session.getState()).armed, false)
  assert.equal(h.timers.size, 0)
})

test(`failed mutations surface errors and do not claim changed state`, async () => {
  const h = harness()
  await h.session.setEnabled(true)
  h.responses.mutation = async () => unavailable()
  await assert.rejects(h.session.setArmed(true), /offline/u)
  assert.equal((await h.session.getState()).armed, false)
  assert.match((await h.session.getState()).error ?? ``, /offline/u)
  await assert.rejects(h.session.queue(`pause`), /offline/u)
})

test(`configuration persistence validates imports and recording omits secret and clipboard fields`, async () => {
  let saved: unknown
  const h = harness({ saveConfig: async config => { saved = structuredClone(config) } })
  await h.session.initialize()
  await h.session.savePreset({ ...createDebugPresets()[0]!, label: `Custom ListPlayers`, priority: `high` })
  await h.session.configure({ ...(await h.session.getState()).layout, tests: { visible: true, x: 0.2, y: 0.2, scale: 1, opacity: 1 } })
  const restored = harness({ loadConfig: async () => saved })
  await restored.session.initialize()
  assert.equal((await restored.session.getState()).presets[0]!.label, `Custom ListPlayers`)
  assert.equal((await restored.session.getState()).layout.tests.x, 0.2)
  await h.session.setEnabled(true)
  await h.session.record(true)
  h.responses.action = async () => envelope({ status: `completed`, sentCommands: 1, clipboard: `private clipboard`, token: `private token`, commandResults: [{ sent: true }] })
  await h.session.run(1)
  await flush()
  await h.session.mark(`observation`)
  const recording = await h.session.exportRecording()
  assert.doesNotMatch(recording, /private clipboard|private token/u)
  assert.match(recording, /sentCommands|observation/u)
  await h.session.resetPresets()
  assert.equal((await h.session.getState()).presets[0]!.priority, `low`)
})

test(`duplicate shortcut sequences within one response trigger once and history bounds retain latest entries`, async () => {
  const h = harness({ eventLimit: 10, runLimit: 2 })
  await h.session.setEnabled(true)
  await h.session.setArmed(true)
  const shortcut = { sequence: 1, timeMs: 1100, kind: `shortcut`, slot: 1, message: `press` }
  h.core.sequence = 1
  h.core.events = [shortcut, shortcut]
  await h.advance(100)
  assert.equal(h.requests.filter(request => request.path === `/v3/actions`).length, 1)
  for (let index = 0; index < 3; index++) await h.session.run(1)
  await flush()
  assert.equal((await h.session.getState()).runs.length, 2)
  h.core.sequence = 20
  h.core.events = Array.from({ length: 19 }, (_, index) => ({ sequence: index + 2, timeMs: 1200, kind: `queue`, message: `${index}` }))
  await h.advance(100)
  assert.deepEqual((await h.session.getState()).events.map(event => event.sequence), [11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
  await h.session.record(true)
  for (let index = 0; index < 15; index++) await h.session.mark(`${index}`)
  assert.equal(JSON.parse(await h.session.exportRecording()).entries.length, 10)
})

test(`a pause or timing response arriving after disable is immediately undone`, async () => {
  for (const operation of [`pause`, `settings`] as const) {
    const h = harness()
    await h.session.setEnabled(true)
    const delayed = deferred<CoreCallResult>()
    h.responses.mutation = () => delayed.promise
    const pending = operation === `pause` ? h.session.queue(`pause`) : h.session.settings({ ActionLowTtlMs: 1234 })
    h.responses.mutation = undefined
    await h.session.setEnabled(false)
    delayed.resolve(envelope({}))
    await pending
    assert.ok(h.requests.some(request => operation === `pause` ? request.body?.operation === `resume` : request.path === `/v3/debug/settings` && request.body.reset))
  }
})

test(`stale armed snapshot cannot undo a successfully acknowledged arm`, async () => {
  const h = harness()
  await h.session.setEnabled(true)
  const delayed = deferred<CoreCallResult>()
  h.responses.get = () => delayed.promise
  await h.advance(100)
  h.core.sequence = 5
  await h.session.setArmed(true)
  delayed.resolve(envelope(snapshot()))
  await flush()
  assert.equal((await h.session.getState()).armed, true)
})

test(`lost arm acknowledgment disarms Core before automatic rearming`, async () => {
  const h = harness()
  await h.session.setEnabled(true)
  h.responses.mutation = async () => {
    h.core.armed = true
    return unavailable()
  }
  await assert.rejects(h.session.setArmed(true))
  const before = h.requests.length
  h.responses.mutation = undefined
  await h.advance(100)
  assert.deepEqual(h.requests.slice(before).filter(request => request.path === `/v3/debug/session`).map(request => request.body.enabled), [false, true])
  assert.equal(h.core.armed, true)
  assert.equal((await h.session.getState()).armed, true)
})

test(`Core arm success must include an acknowledged armed state and sequence`, async () => {
  const h = harness()
  await h.session.setEnabled(true)
  h.responses.mutation = async () => envelope({})
  await assert.rejects(h.session.setArmed(true), /Invalid Core arm/u)
  assert.equal((await h.session.getState()).armed, false)
})

test(`producer suspension completing after disconnect is released`, async () => {
  const delayed = deferred<void>()
  const changes: boolean[] = []
  const h = harness({ setProducerPaused: async (_producer, paused) => {
    changes.push(paused)
    if (paused) await delayed.promise
  } })
  await h.session.setEnabled(true)
  const suspending = h.session.setProducerPaused(`antiAfk`, true)
  h.responses.get = async () => unavailable()
  await h.advance(100)
  delayed.resolve()
  await suspending
  assert.deepEqual(changes, [true, false])
  assert.equal((await h.session.getState()).pausedProducers.antiAfk, false)
})

test(`an older producer reply preserves the latest suspension intent`, async () => {
  const delayed = deferred<void>()
  let count = 0
  let pausedNow = false
  const h = harness({ setProducerPaused: async (_producer, paused) => {
    pausedNow = paused
    if (++count === 1) await delayed.promise
  } })
  await h.session.setEnabled(true)
  const older = h.session.setProducerPaused(`wanted`, true)
  await h.session.setProducerPaused(`wanted`, false)
  await h.session.setProducerPaused(`wanted`, true)
  delayed.resolve()
  await older
  assert.equal(pausedNow, true)
  assert.equal((await h.session.getState()).pausedProducers.wanted, true)
})

test(`mutation errors remain reviewable across successful polling and recording removes raw clipboard output`, async () => {
  const h = harness()
  await h.session.setEnabled(true)
  h.responses.mutation = async () => unavailable()
  await assert.rejects(h.session.queue(`pause`))
  h.responses.mutation = undefined
  await h.advance(100)
  assert.match((await h.session.getState()).error ?? ``, /offline/u)
  await h.session.record(true)
  h.responses.action = async () => envelope({ status: `completed`, sentCommands: 1, rawText: `arbitrary clipboard`, commandResults: [{ data: { rawText: `nested clipboard` } }] })
  await h.session.run(1)
  await flush()
  const output = await h.session.exportRecording()
  assert.doesNotMatch(output, /arbitrary clipboard|nested clipboard/u)
  const request = JSON.parse(output).entries.find((entry: any) => entry.kind === `request`)
  assert.equal(request.data.commands[0].restoreClipboard, true)
})

test(`failed persistence leaves custom state unchanged and reports the failure`, async () => {
  const h = harness({ saveConfig: async () => { throw new Error(`disk full`) } })
  await assert.rejects(h.session.savePreset({ ...createDebugPresets()[0]!, label: `unsaved` }), /disk full/u)
  assert.equal((await h.session.getState()).presets[0]!.label, `Once: ListPlayers - Low priority`)
  assert.equal((await h.session.getState()).error, `disk full`)
})

test(`removed shortcuts neither run tests nor stop the ServerSay loop`, async () => {
  const h = harness()
  await h.session.setEnabled(true)
  await h.session.setArmed(true)
  await h.session.run(2)
  h.core.sequence = 2
  h.core.events = [
    { sequence: 1, timeMs: 1100, kind: `shortcut`, slot: 9, message: `stop` },
    { sequence: 2, timeMs: 1101, kind: `shortcut`, slot: 5, message: `removed` }
  ]
  await h.advance(100)
  assert.equal(h.requests.filter(request => request.path === `/v3/actions`).length, 1)
  assert.equal((await h.session.getState()).scheduled?.length, 1)
  await assert.rejects(h.session.run(9), /Slot/u)
  h.core.sequence = 3
  h.core.events = [{ sequence: 3, timeMs: 1200, kind: `shortcut`, slot: 1, message: `later press` }]
  await h.advance(100)
  assert.equal(h.requests.filter(request => request.path === `/v3/actions`).length, 2)
  await h.session.stop()
})

test(`snapshot parsing normalizes omitted nullable status and rejects malformed queue diagnostics`, async () => {
  const h = harness()
  const raw = JSON.parse(JSON.stringify(h.core, (_key, value) => value === null ? undefined : value))
  h.responses.get = async () => envelope(raw)
  await h.session.setEnabled(true)
  assert.equal((await h.session.getState()).core?.status.queue.id, null)
  assert.equal((await h.session.getState()).core?.status.focus.reason, null)
  raw.queue.actions = `broken`
  await h.advance(100)
  assert.equal((await h.session.getState()).core, null)
  assert.match((await h.session.getState()).error ?? ``, /Invalid Core debug/u)
})

test(`concurrent saves preserve both slots and serialize storage writes`, async () => {
  const first = deferred<void>()
  const saved: any[] = []
  const h = harness({ saveConfig: async config => {
    saved.push(structuredClone(config))
    if (saved.length === 1) await first.promise
  } })
  const one = h.session.savePreset({ ...createDebugPresets()[0]!, label: `One` })
  const two = h.session.savePreset({ ...createDebugPresets()[1]!, label: `Two` })
  await flush()
  assert.equal(saved.length, 1)
  first.resolve()
  await one
  await two
  assert.deepEqual(saved.at(-1).presets.map((preset: any) => preset.label), [`One`, `Two`])
})

test(`lost pause and settings acknowledgments retain cleanup intent through stop, disable and reconnect`, async () => {
  for (const operation of [`pause`, `settings`] as const) {
    for (const lifecycle of [`stop`, `disable`, `reconnect`] as const) {
      const h = harness()
      await h.session.setEnabled(true)
      h.responses.mutation = async () => unavailable()
      await assert.rejects(operation === `pause` ? h.session.queue(`pause`) : h.session.settings({ Queue__ActionTtlMs: 1000 }))
      h.responses.mutation = undefined
      if (lifecycle === `stop`) await h.session.stop()
      else if (lifecycle === `disable`) await h.session.setEnabled(false)
      else {
        h.responses.get = async () => unavailable()
        await h.advance(100)
        h.responses.get = undefined
        await h.advance(100)
      }
      assert.ok(h.requests.some(request => operation === `pause` ? request.body?.operation === `resume` : request.path === `/v3/debug/settings` && request.body.reset), `${operation} cleanup after ${lifecycle}`)
    }
  }
})

test(`a lost mutation reply arriving after stop causes another cleanup attempt`, async () => {
  for (const operation of [`pause`, `settings`] as const) {
    const h = harness()
    await h.session.setEnabled(true)
    const delayed = deferred<CoreCallResult>()
    h.responses.mutation = () => delayed.promise
    const mutation = operation === `pause` ? h.session.queue(`pause`) : h.session.settings({ Queue__ActionTtlMs: 1000 })
    h.responses.mutation = undefined
    await h.session.stop()
    const before = h.requests.length
    delayed.resolve(unavailable())
    await assert.rejects(mutation)
    assert.ok(h.requests.slice(before).some(request => operation === `pause` ? request.body?.operation === `resume` : request.body?.reset))
  }
})

test(`arming retains ordinary events before its acknowledgment while rejecting older shortcuts`, async () => {
  const h = harness()
  await h.session.setEnabled(true)
  h.core.sequence = 3
  h.core.events = [
    { sequence: 1, timeMs: 1000, kind: `queued`, message: `ordinary queue event` },
    { sequence: 2, timeMs: 1001, kind: `shortcut`, slot: 1, message: `old press` },
    { sequence: 3, timeMs: 1002, kind: `phase`, message: `ordinary phase event` }
  ]
  await h.session.setArmed(true)
  await h.advance(100)
  assert.deepEqual((await h.session.getState()).events.map(event => event.sequence), [1, 2, 3])
  assert.equal(h.requests.filter(request => request.path === `/v3/actions`).length, 0)
  assert.ok(h.requests.filter(request => request.path === `/v3/debug?after=0`).length >= 2)
  h.core.sequence = 4
  h.core.events.push({ sequence: 4, timeMs: 1200, kind: `shortcut`, slot: 1, message: `new press` })
  await h.advance(100)
  assert.equal(h.requests.filter(request => request.path === `/v3/actions`).length, 1)
})

test(`stop preserves a delayed submission response while Core remembers its cancellation`, async () => {
  const h = harness()
  const pending = deferred<CoreCallResult>()
  h.responses.action = async () => pending.promise
  await h.session.setEnabled(true)
  await h.session.run(1)
  const submission = h.requests.find(request => request.path === `/v3/actions`)!
  h.responses.mutation = async () => envelope({ found: false })
  await h.session.stop()
  assert.equal(submission.signal?.aborted, false)
  pending.resolve({ ok: false, status: 409, statusText: `Conflict`, data: { ok: false, data: { status: `cancelled`, sentCommands: 0, commandResults: [] } } })
  await flush()
  assert.equal((await h.session.getState()).runs[0]!.state, `cancelled`)
})

test(`a completed Action result arriving after Stop retains its actual sent progress`, async () => {
  const h = harness()
  const pending = deferred<CoreCallResult>()
  h.responses.action = async () => pending.promise
  await h.session.setEnabled(true)
  await h.session.run(1)
  h.responses.mutation = async () => envelope({ found: false })
  await h.session.stop()
  assert.equal(h.requests.find(request => request.path === `/v3/actions`)?.signal?.aborted, false)
  pending.resolve(envelope({ status: `completed`, sentCommands: 3, commandResults: [{ index: 0, sent: true }, { index: 1, sent: true }, { index: 2, sent: true }] }))
  await flush()
  const run = (await h.session.getState()).runs[0]!
  assert.equal(run.state, `completed`)
  assert.equal(((run.result as CoreCallResult).data as any).data.sentCommands, 3)
})

test(`a failed cancel aborts the pending transport and retains cancellation intent for reconnect`, async () => {
  const h = harness()
  const pending = deferred<CoreCallResult>()
  h.responses.action = async () => pending.promise
  await h.session.setEnabled(true)
  await h.session.run(1)
  const submission = h.requests.find(request => request.path === `/v3/actions`)!
  h.responses.mutation = async () => unavailable()
  await assert.rejects(h.session.stop())
  assert.equal(submission.signal?.aborted, true)
  pending.resolve(unavailable())
  await flush()
  h.responses.get = async () => unavailable()
  await h.advance(100)
  h.responses.get = undefined
  h.responses.mutation = undefined
  await h.advance(100)
  assert.equal(h.requests.filter(request => request.body?.operation === `cancel` && request.body.id === submission.body.id).length, 2)
  assert.equal(h.requests.filter(request => request.path === `/v3/actions`).length, 1)
})

test(`Apply and Reset expose acknowledged effective timings before another poll`, async () => {
  const h = harness()
  await h.session.setEnabled(true)
  h.responses.mutation = async () => envelope({ Queue__ActionTtlMs: 1234, QUEUE_GATE_NORMAL: 500 })
  await h.session.settings({ Queue__ActionTtlMs: 1234 })
  assert.deepEqual((await h.session.getState()).core?.settings, { Queue__ActionTtlMs: 1234, QUEUE_GATE_NORMAL: 500 })
  h.responses.mutation = async () => envelope({ Queue__ActionTtlMs: 30000, QUEUE_GATE_NORMAL: 500 })
  await h.session.settings({}, false, true)
  assert.equal((await h.session.getState()).core?.settings.Queue__ActionTtlMs, 30000)
  h.responses.mutation = async () => envelope({ Queue__ActionTtlMs: `invalid` })
  await assert.rejects(h.session.settings({ Queue__ActionTtlMs: 1234 }), /Invalid Core debug settings/u)
  assert.equal((await h.session.getState()).core?.settings.Queue__ActionTtlMs, 30000)
})

test(`a poll started before Apply cannot replace acknowledged timings but later polls remain authoritative`, async () => {
  const h = harness()
  h.core.settings = { Queue__ActionTtlMs: 30000 }
  await h.session.setEnabled(true)
  const oldSnapshot = structuredClone(h.core)
  const pending = deferred<CoreCallResult>()
  h.responses.get = async () => pending.promise
  await h.advance(100)
  h.responses.mutation = async () => envelope({ Queue__ActionTtlMs: 1234 })
  await h.session.settings({ Queue__ActionTtlMs: 1234 })
  pending.resolve(envelope(oldSnapshot))
  await flush()
  assert.equal((await h.session.getState()).core?.settings.Queue__ActionTtlMs, 1234)
  h.core.settings.Queue__ActionTtlMs = 5000
  h.responses.get = undefined
  await h.advance(100)
  assert.equal((await h.session.getState()).core?.settings.Queue__ActionTtlMs, 5000)
})

test(`the maximum configured history limit does not silently fall back to 100 runs`, async () => {
  const h = harness({ runLimit: 10000, publish: () => {} })
  await h.session.setEnabled(true)
  for (let count = 0; count < 101; count++) await h.session.run(1)
  await flush()
  assert.equal((await h.session.getState()).runs.length, 101)
})

for (const [slot, intervalMs] of [[3, 150], [4, 200]] as const) {
  test(`numpad ${slot} repeats its commands every ${intervalMs}ms until toggled off`, async () => {
    const h = harness()
    await h.session.setEnabled(true)
    await h.session.run(slot)
    const actions = () => h.requests.filter(request => request.path === `/v3/actions`).map(request => request.body)
    assert.deepEqual(actions()[0].commands.map((command: { command: string }) => command.command), slot === 3
      ? [`ListPlayers`] : [`ListPlayers`, `ServerSay "Dev test - 200ms - #1"`])
    await h.advance(intervalMs - 1)
    assert.equal(actions().length, 1)
    await h.advance(1)
    assert.equal(actions().length, 2)
    assert.equal(actions()[1].commands[0].delayMs, intervalMs)
    await h.session.run(slot)
    await h.advance(intervalMs * 3)
    assert.equal(actions().length, 2)
    assert.deepEqual((await h.session.getState()).scheduled, [])
  })
}

test(`hiding the HUD keeps Debug and loops active and enabling Debug shows it again`, async () => {
  const h = harness()
  h.session.toggleHud()
  assert.equal((await h.session.getState()).hudVisible, false)
  await h.session.setEnabled(true)
  assert.equal((await h.session.getState()).hudVisible, true)
  await h.session.run(2)
  h.session.toggleHud()
  await h.session.setEnabled(true)
  await h.advance(250)
  const state = await h.session.getState()
  assert.equal(state.enabled, true)
  assert.equal(state.armed, true)
  assert.equal(state.hudVisible, false)
  assert.equal(h.requests.filter(request => request.path === `/v3/actions`).length, 2)
  h.session.toggleHud()
  assert.equal((await h.session.getState()).hudVisible, true)
  h.session.toggleHud()
  await h.session.setEnabled(false)
  await h.session.setEnabled(true)
  assert.equal((await h.session.getState()).hudVisible, true)
  assert.deepEqual((await h.session.getState()).scheduled, [])
  await h.session.setEnabled(false)
})
