import assert from 'node:assert/strict'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { CommandHistoryService } from './commandHistoryService'
import { readSubmittedCommands } from './commandHistoryResponses'
import { initialGameState } from '../../shared/gameState'
import type { ConsoleSubmission } from '../../shared/commandHistory/commandHistory'
import type { CoreCallResult } from '../types'

const ok = (data: unknown): CoreCallResult => ({ ok: true, status: 200, statusText: `OK`, data: { ok: true, data } })

function fixture(running = true) {
  let utc = 10_000
  let mono = 0
  let timerId = 0
  const timers = new Map<number, { at: number, run: () => void }>()
  const listeners = new Set<() => void>()
  const state = {
    binding: { clientId: `client`, gameServerId: 1, generation: 0, authEpoch: 1 },
    history: [`old`], receipts: [] as ConsoleSubmission[], streamId: `core-1`, lost: false,
    game: { ...initialGameState, available: true, running }, gameProcessId: 22,
    override: null as null | ((path: string, init: RequestInit) => Promise<CoreCallResult>)
  }
  const calls: { path: string, signal: AbortSignal | null | undefined }[] = []
  const normalRead = async (path: string): Promise<CoreCallResult> => {
    if (path === `/chivalry2/input/`) {
      utc += 10
      mono += 10
      return ok({ file: `Input.ini`, sections: { [`/Script/TBL.TBLConsole`]: { HistoryBuffer: state.history } } })
    }
    const after = Number(new URL(path, `http://core`).searchParams.get(`after`))
    const retained = state.receipts.slice(-1024)
    return ok({ streamId: state.streamId, sequence: state.receipts.at(-1)?.sequence ?? 0,
      oldestSequence: retained[0]?.sequence ?? 0, eventsLost: state.lost || after < (retained[0]?.sequence ?? 1) - 1,
      game: { processId: state.gameProcessId, windowHandle: `0x2` },
      commands: retained.filter(receipt => receipt.sequence > after).map(receipt => ({
        ...receipt, ageMs: utc - Date.parse(receipt.submittedAtUtc)
      })) })
  }
  const service = new CommandHistoryService({
    callCore: async (path, init) => {
      calls.push({ path, signal: init.signal })
      return state.override ? state.override(path, init) : normalRead(path)
    },
    game: { get: () => state.game, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } } },
    appProcessId: 11, utcNow: () => utc, monotonicNow: () => mono,
    getBinding: () => state.binding,
    setTimeout: (run, delay) => { timers.set(++timerId, { at: mono + delay, run }); return timerId },
    clearTimeout: id => { timers.delete(id as number) }
  })
  return {
    service, state, calls, normalRead,
    start: async () => { service.setUser(1); service.start(); await setImmediate() },
    advance: async (milliseconds: number) => {
      utc += milliseconds
      mono += milliseconds
      for (const [id, timer] of [...timers]) if (timer.at <= mono) { timers.delete(id); timer.run() }
      await setImmediate()
    },
    setRunning: (running: boolean) => { state.game = { ...state.game, running }; listeners.forEach(listener => listener()) },
    jumpClock: () => { utc += 60_000 },
    submit: (command: string, appProcessId = 11) => {
      state.receipts.push({ sequence: state.receipts.length + 1, command, submittedAtUtc: new Date(utc - 1).toISOString(),
        ageMs: 1, actionId: `action`, commandIndex: 0, author: `system`, appProcessId, gameProcessId: state.gameProcessId })
    }
  }
}

test(`observations include all fresh rows and following context before the UI slices ten`, async () => {
  const f = fixture()
  const frames: any[] = []
  f.service.subscribeObservations(frame => frames.push(frame))
  await f.start()
  assert.equal(frames.at(-1).rows[0].binding, null)
  f.state.history.push(...Array.from({ length: 12 }, (_, i) => `Adminsay console${i}`))
  await f.advance(1000)
  const first = frames.at(-1).rows[1]
  assert.equal(first.row.origin, `pending`)
  assert.equal(first.binding.gameServerId, 1)
  await f.advance(3000)
  assert.equal(frames.at(-1).rows.filter((item: any) => item.row.origin === `external`).length, 12)
  assert.equal(first.followingCommands.length, 11)
  assert.equal(f.service.getState().rows.length, 10)
  f.state.binding = { ...f.state.binding, gameServerId: 2, generation: 1 }
  await f.advance(1000)
  assert.ok(frames.at(-1).rows.every((item: any) => item.row.origin === `unknown` && item.binding === null))
  f.service.stop()
})

test(`a binding change across paired reads discards candidates and establishes a new baseline`, async () => {
  const f = fixture()
  const frames: any[] = []
  f.service.subscribeObservations(frame => frames.push(frame))
  await f.start()
  f.state.history.push(`Adminsay transition`)
  f.state.override = async path => {
    const result = await f.normalRead(path)
    if (path.startsWith(`/v3/commands`)) f.state.binding = { ...f.state.binding, generation: 1 }
    return result
  }
  await f.advance(1000)
  assert.equal(frames.at(-1).rows.length, 0)
  f.state.override = null
  await f.advance(1000)
  assert.ok(frames.at(-1).rows.every((item: any) => item.row.origin === `unknown`))
  f.service.stop()
})

test(`one background monitor polls sequentially every second and uses the accepted receipt cursor`, async () => {
  const f = fixture()
  await f.start()
  f.service.start()
  f.service.setUser(1)
  assert.deepEqual(f.calls.map(call => call.path), [`/chivalry2/input/`, `/v3/commands?after=0`])
  f.state.history.push(`ListPlayers`)
  f.submit(`ListPlayers`)
  await f.advance(999)
  assert.equal(f.calls.length, 2)
  await f.advance(1)
  assert.equal(f.service.getState().rows[1].origin, `spellbook`)
  await f.advance(1_000)
  assert.equal(f.calls.at(-1)?.path, `/v3/commands?after=1`)
  f.service.stop()
  await f.advance(5_000)
  assert.equal(f.calls.length, 6)
  assert.equal(f.service.getState().status, `inactive`)
  assert.equal(f.service.getState().rows.length, 0)
})

test(`game availability owns polling independently of focus and renderer visibility`, async () => {
  const f = fixture(false)
  await f.start()
  assert.equal(f.calls.length, 0)
  assert.equal(f.service.getState().status, `waiting`)
  f.setRunning(true)
  await setImmediate()
  assert.equal(f.calls.length, 2)
  assert.equal(f.state.game.focused, false)
  f.setRunning(false)
  await f.advance(5_000)
  assert.equal(f.calls.length, 2)
  assert.equal(f.service.getState().rows.length, 0)
  f.service.stop()
})

test(`failed or malformed history retains the display and recovery never classifies gap contents as outside`, async () => {
  const f = fixture()
  await f.start()
  f.state.override = async () => ok({ file: `Input.ini`, sections: {} })
  await f.advance(1_000)
  assert.equal(f.service.getState().status, `unavailable`)
  assert.deepEqual(f.service.getState().rows.map(row => row.command), [`old`])
  f.state.override = null
  f.state.history.push(`during gap`)
  await f.advance(5_000)
  assert.deepEqual(f.service.getState().rows.map(row => row.origin), [`unknown`, `unknown`])
  f.service.stop()
})

test(`old Core endpoints report incompatibility without a status-snapshot fallback`, async () => {
  const f = fixture()
  f.state.override = async path => path.startsWith(`/v3/commands`)
    ? { ok: false, status: 404, statusText: `Not Found`, data: null } : f.normalRead(path)
  await f.start()
  assert.equal(f.service.getState().status, `incompatible`)
  assert.ok(f.calls.every(call => !call.path.includes(`/status`)))
  f.service.stop()
})

test(`Core loss, game replacement and account changes all establish unknown baselines`, async () => {
  const f = fixture()
  await f.start()
  f.state.history.push(`manual`)
  await f.advance(1_000)
  assert.equal(f.service.getState().rows[1].origin, `pending`)
  f.state.lost = true
  await f.advance(4_000)
  assert.equal(f.service.getState().rows[1].origin, `unknown`)
  f.state.lost = false
  f.state.history.push(`new game`)
  f.state.gameProcessId = 23
  await f.advance(1_000)
  assert.ok(f.service.getState().rows.every(row => row.origin === `unknown`))
  f.state.streamId = `core-2`
  f.state.history.push(`new core`)
  await f.advance(1_000)
  assert.ok(f.service.getState().rows.every(row => row.origin === `unknown`))
  f.service.setUser(2)
  assert.equal(f.service.getState().rows.length, 0)
  await setImmediate()
  assert.ok(f.service.getState().rows.every(row => row.origin === `unknown`))
  f.service.setUser(null)
  assert.equal(f.service.getState().rows.length, 0)
  f.service.stop()
})

test(`slow requests never overlap and stopped generations cannot publish late data`, async () => {
  const f = fixture()
  let finish!: (result: CoreCallResult) => void
  f.state.override = async () => new Promise(resolve => { finish = resolve })
  await f.start()
  await f.advance(1_000)
  assert.equal(f.calls.length, 1)
  f.service.stop()
  assert.equal(f.calls[0].signal?.aborted, true)
  finish(ok({ file: `Input.ini`, sections: { [`/Script/TBL.TBLConsole`]: { HistoryBuffer: [`late`] } } }))
  await setImmediate()
  assert.equal(f.service.getState().rows.length, 0)
  assert.equal(f.calls.length, 1)
})

test(`the three-second request timeout aborts and the next attempt can recover`, async () => {
  const f = fixture()
  f.state.override = async (_path, init) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener(`abort`, () => reject(new Error(`Read timed out`)), { once: true })
  })
  await f.start()
  await f.advance(2_999)
  assert.equal(f.calls[0].signal?.aborted, false)
  await f.advance(1)
  assert.equal(f.calls[0].signal?.aborted, true)
  assert.equal(f.service.getState().status, `unavailable`)
  f.state.override = null
  await f.advance(1_000)
  assert.equal(f.service.getState().status, `monitoring`)
  f.service.stop()
})

test(`clock jumps and submissions belonging to another app cannot become trusted SpellBook origin`, async () => {
  const f = fixture()
  await f.start()
  f.state.history.push(`other app`)
  f.submit(`other app`, 12)
  await f.advance(1_000)
  assert.equal(f.service.getState().rows[1].origin, `pending`)
  f.jumpClock()
  await f.advance(1_000)
  assert.ok(f.service.getState().rows.every(row => row.origin === `unknown`))
  f.service.stop()
})

test(`receipt validation rejects a sequence gap even if the provider claims complete coverage`, () => {
  const commands = [1, 3].map(sequence => ({ sequence, command: `test`, submittedAtUtc: new Date(0).toISOString(),
    ageMs: 0, actionId: `action`, commandIndex: 0, author: `user`, appProcessId: 11, gameProcessId: 22 }))
  assert.throws(() => readSubmittedCommands(ok({ streamId: `core`, sequence: 3, oldestSequence: 1,
    eventsLost: false, game: { processId: 22, windowHandle: `0x2` }, commands }), 0))
})

test(`a submission between baseline reads stays available when the file exposes it on the following poll`, async () => {
  const f = fixture()
  f.state.override = async path => {
    if (path === `/chivalry2/input/`) {
      const result = await f.normalRead(path)
      f.submit(`between reads`)
      return result
    }
    return f.normalRead(path)
  }
  await f.start()
  f.state.override = null
  f.state.history.push(`between reads`)
  await f.advance(1_000)
  assert.equal(f.service.getState().rows[1].origin, `spellbook`)
  await f.advance(4_000)
  assert.notEqual(f.service.getState().rows[1].origin, `external`)
  f.service.stop()
})

test(`retired unmatched receipts leave bounded uncertainty instead of misclassifying delayed saves`, async () => {
  const f = fixture()
  await f.start()
  f.submit(`delayed save`)
  await f.advance(1_000)
  await f.advance(31_000)
  f.state.history.push(`delayed save`, `fresh manual`)
  await f.advance(1_000)
  await f.advance(3_000)
  assert.equal(f.service.getState().rows[1].origin, `unknown`)
  assert.equal(f.service.getState().rows[2].origin, `external`)
  f.service.stop()
})

test(`local receipt overflow cannot turn a previously observed submission into an outside command`, async () => {
  const f = fixture()
  await f.start()
  for (let index = 0; index < 600; index++) f.submit(`submitted ${index}`)
  await f.advance(1_000)
  for (let index = 600; index < 1200; index++) f.submit(`submitted ${index}`)
  await f.advance(1_000)
  f.state.history.push(`submitted 0`)
  await f.advance(1_000)
  await f.advance(3_000)
  assert.equal(f.service.getState().rows[1].origin, `unknown`)
  f.service.stop()
})

test(`a restarted Core is read from its own cursor before baseline evidence is committed`, async () => {
  const f = fixture()
  await f.start()
  f.submit(`old core`)
  await f.advance(1_000)
  f.state.streamId = `core-2`
  f.state.receipts = []
  f.state.override = async path => {
    if (path === `/chivalry2/input/`) {
      const result = await f.normalRead(path)
      f.submit(`new core between reads`)
      return result
    }
    return f.normalRead(path)
  }
  await f.advance(1_000)
  f.state.override = null
  f.state.history.push(`new core between reads`)
  await f.advance(1_000)
  assert.equal(f.service.getState().rows[1].origin, `spellbook`)
  f.service.stop()
})

test(`exceeding bounded retired-evidence capacity leaves unmatched origins unknown`, async () => {
  const f = fixture()
  await f.start()
  for (let batch = 0; batch < 5; batch++) {
    for (let index = 0; index < 600; index++) f.submit(`unique ${batch}-${index}`)
    await f.advance(1_000)
  }
  f.state.history.push(`new manual after evidence overflow`)
  await f.advance(1_000)
  await f.advance(3_000)
  assert.equal(f.service.getState().rows[1].origin, `unknown`)
  f.service.stop()
})

test(`a manual command remains detectable while ListPlayers moves to the end of the saved history`, async () => {
  const f = fixture()
  f.state.history = [`old`, `ListPlayers`]
  await f.start()
  f.state.history = [`old`, `serversay test3`, `ListPlayers`]
  f.submit(`ListPlayers`)
  await f.advance(1_000)
  assert.equal(f.service.getState().status, `monitoring`)
  assert.deepEqual(f.service.getState().rows.map(row => row.command), f.state.history)
  await f.advance(3_000)
  assert.deepEqual(f.service.getState().rows.map(row => row.origin), [`unknown`, `external`, `spellbook`])
  assert.equal(f.service.getState().resetReason, ``)
  f.service.stop()
})

test(`successful stable recovery clears the temporary baseline warning`, async () => {
  const f = fixture()
  await f.start()
  f.state.history = [`rewritten`]
  await f.advance(1_000)
  assert.equal(f.service.getState().status, `recovering`)
  assert.ok(f.service.getState().resetReason)
  await f.advance(1_000)
  assert.equal(f.service.getState().status, `monitoring`)
  assert.equal(f.service.getState().resetReason, ``)
  f.service.stop()
})
