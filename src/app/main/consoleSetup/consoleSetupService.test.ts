import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { ConsoleKeyCode } from '../../shared/consoleKey'
import type { CoreCallResult } from '../types'
import { ConsoleSetupService } from './consoleSetupService'
import { ConsoleVerificationStore } from './consoleVerificationStore'
import type { ListPlayersRefresh } from '../services/list-players-service'

const ok = (data: unknown): CoreCallResult => ({ ok: true, status: 200, statusText: `OK`, data: { ok: true, data } })
const config = (values: string[] | undefined) => ok({ file: `GameUserSettings.ini`, sections: {
  [`/Script/TBL.TBLGameUserSettings`]: values ? { bConsoleEnabled: values } : {}
} })
const output = () => ok({ status: `completed`, sent: true, sentCommands: 1, players: [], rawText: `ServerName: Test` })
const failed = (code: string, sentCommands = 0): CoreCallResult => ({
  ok: false, status: 409, statusText: code,
  data: { ok: false, error: { code, message: code }, data: { status: `failed`, sent: false, sentCommands } }
})

test(`console configuration requires one present True value in the game settings section`, async () => {
  for (const [values, expected] of [[undefined, false], [[`False`], false], [[`true`], false], [[`True`, `False`], false], [[`True`], true]] as const) {
    const fixture = harness({ settings: config(values ? [...values] : undefined) })
    assert.equal(await fixture.service.checkConsoleEnabled(), expected)
    assert.equal(fixture.service.getState().enabled.status, expected ? `passed` : `failed`)
  }
})

test(`enabling writes only the targeted setting and verifies it with a subsequent read`, async () => {
  const calls: string[] = []
  const fixture = harness({ call: async (path, init) => {
    calls.push(`${init?.method ?? `GET`} ${path}`)
    return init?.method === `PATCH` ? ok({ updated: true }) : config([`True`])
  } })
  assert.equal(await fixture.service.enableConsole(), true)
  assert.deepEqual(calls, [
    `PATCH /chivalry2/gameusersettings/?key=bConsoleEnabled&value=True`,
    `GET /chivalry2/gameusersettings/`
  ])
  assert.equal(fixture.service.getState().writing, false)
  assert.equal(fixture.service.getState().enabled.status, `passed`)
})

test(`one settings read checks both window modes independently from console enablement`, async () => {
  for (const fullscreen of [`1`, `2`]) {
    for (const confirmed of [`1`, `2`]) {
      const calls: string[] = []
      const fixture = harness({ call: async (path, init) => {
        calls.push(`${init?.method} ${path}`)
        return ok({ sections: { [`/Script/TBL.TBLGameUserSettings`]: {
          bConsoleEnabled: [`False`], FullscreenMode: [fullscreen], LastConfirmedFullscreenMode: [confirmed]
        } } })
      } })
      assert.equal(await fixture.service.checkConsoleEnabled(), false)
      assert.equal(fixture.service.getState().windowMode.status, `passed`)
      assert.deepEqual(calls, [`GET /chivalry2/gameusersettings/`])
    }
  }
})

test(`window mode cannot pass with either exclusive, missing, duplicate or invalid setting`, async () => {
  for (const field of [`FullscreenMode`, `LastConfirmedFullscreenMode`]) {
    for (const values of [undefined, [], [`0`], [`3`], [`1`, `2`], [1]]) {
      const fixture = harness({ settings: ok({ sections: { [`/Script/TBL.TBLGameUserSettings`]: {
        bConsoleEnabled: [`True`], FullscreenMode: [`1`], LastConfirmedFullscreenMode: [`1`], [field]: values
      } } }) })
      assert.equal(await fixture.service.checkConsoleEnabled(), true)
      assert.equal(fixture.service.getState().windowMode.status, `failed`)
    }
  }
})

test(`a successful write cannot report enabled when readback still says False`, async () => {
  const fixture = harness({ call: async (_path, init) => init?.method === `PATCH` ? ok({ updated: true }) : config([`False`]) })
  assert.equal(await fixture.service.enableConsole(), false)
  assert.equal(fixture.service.getState().enabled.status, `failed`)
})

test(`configuration read errors stay unavailable rather than reporting a disabled console`, async () => {
  const fixture = harness({ settings: failed(`CONFIG_READ_FAILED`) })
  await assert.rejects(fixture.service.checkConsoleEnabled())
  assert.equal(fixture.service.getState().enabled.status, `unavailable`)
  assert.equal(fixture.service.getState().windowMode.status, `unavailable`)
})

test(`manual bind check accepts fresh empty-player output even when backend ingestion fails`, async () => {
  const fixture = harness({ refresh: async service => {
    service.observeListPlayers(output(), `NumpadSubtract`)
    return { result: failed(`SERVER_UNAVAILABLE`), consoleOutput: { result: output(), key: `NumpadSubtract` } }
  } })
  assert.equal(await fixture.service.checkConsoleBind(), true)
  assert.equal(fixture.service.getState().binding.status, `passed`)
})

test(`an explicit ListPlayers output timeout marks the binding invalid and requires explicit retry`, async () => {
  const fixture = harness({ refresh: async service => {
    const result = failed(`CLIPBOARD_TIMEOUT`, 1)
    service.observeListPlayers(result, `NumpadSubtract`)
    return { result, consoleOutput: { result, key: `NumpadSubtract` } }
  } })
  assert.equal(await fixture.service.checkConsoleBind(), false)
  assert.equal(fixture.service.getState().binding.status, `failed`)
  fixture.service.observeListPlayers(output(), `NumpadSubtract`)
  assert.equal(fixture.service.getState().binding.status, `failed`)
})

test(`unavailable game and unsubmitted or interrupted actions never diagnose the key as wrong`, async () => {
  const absent = harness({ running: false })
  await assert.rejects(absent.service.checkConsoleBind())
  assert.equal(absent.refreshCount(), 0)
  assert.equal(absent.service.getState().binding.status, `unavailable`)
  for (const code of [`ACTION_EXPIRED`, `OUTPUT_INTERRUPTED`, `CLIPBOARD_CHANGED`, `CHAT_ACTIVE`]) {
    const fixture = harness({ refresh: async service => {
      const result = failed(code, code === `OUTPUT_INTERRUPTED` ? 1 : 0)
      service.observeListPlayers(result, `NumpadSubtract`)
      return { result, consoleOutput: { result, key: `NumpadSubtract` } }
    } })
    await assert.rejects(fixture.service.checkConsoleBind())
    assert.equal(fixture.service.getState().binding.status, `unavailable`)
  }
})

test(`concurrent manual checks share one refresh and key changes discard the old result`, async () => {
  let key: ConsoleKeyCode = `NumpadSubtract`
  const fixture = harness({ getKey: () => key, refresh: async service => {
    key = `Backquote`
    service.settingsChanged()
    service.observeListPlayers(output(), `NumpadSubtract`)
    return { result: output(), consoleOutput: { result: output(), key: `NumpadSubtract` } }
  } })
  const results = await Promise.allSettled([fixture.service.checkConsoleBind(), fixture.service.checkConsoleBind()])
  assert.equal(fixture.refreshCount(), 1)
  assert.ok(results.every(result => result.status === `rejected`))
  assert.equal(fixture.service.getState().consoleKey, `Backquote`)
  assert.equal(fixture.service.getState().binding.status, `unchecked`)
})

test(`background ListPlayers supplies the initial check without another input request`, () => {
  const fixture = harness()
  fixture.service.observeListPlayers(failed(`GAME_NOT_RUNNING`), `NumpadSubtract`)
  assert.equal(fixture.service.getState().binding.status, `unchecked`)
  fixture.service.observeListPlayers(output(), `NumpadSubtract`)
  assert.equal(fixture.service.getState().binding.status, `passed`)
  assert.equal(fixture.refreshCount(), 0)
})

test(`a joined request returns its own output even if its observer ran before the manual check`, async () => {
  const fixture = harness({ refresh: async () => ({ result: failed(`SERVER_UNAVAILABLE`),
    consoleOutput: { result: output(), key: `NumpadSubtract` } }) })
  fixture.service.observeListPlayers(output(), `NumpadSubtract`)
  assert.equal(await fixture.service.checkConsoleBind(), true)
})

test(`a new-key check waits for the old check and then tests the new key`, async () => {
  let key: ConsoleKeyCode = `NumpadSubtract`
  let release!: () => void
  const waiting = new Promise<void>(resolve => { release = resolve })
  const keys: ConsoleKeyCode[] = []
  const fixture = harness({ getKey: () => key, refresh: async () => {
    const captured = key
    keys.push(captured)
    if (captured === `NumpadSubtract`) await waiting
    return { result: output(), consoleOutput: { result: output(), key: captured } }
  } })
  const oldCheck = fixture.service.checkConsoleBind()
  await new Promise(resolve => setImmediate(resolve))
  key = `Backquote`
  fixture.service.settingsChanged()
  const results = Promise.allSettled([oldCheck, fixture.service.checkConsoleBind()])
  release()
  const [oldResult, newResult] = await results
  assert.equal(oldResult.status, `rejected`)
  assert.deepEqual(newResult, { status: `fulfilled`, value: true })
  assert.deepEqual(keys, [`NumpadSubtract`, `Backquote`])
  assert.equal(fixture.service.getState().binding.status, `passed`)
})

test(`a current-key check starts new input after joining a background request for an older key`, async () => {
  let attempt = 0
  const fixture = harness({ getKey: () => `Backquote`, refresh: async () => ({
    result: output(), consoleOutput: { result: output(), key: attempt++ === 0 ? `NumpadSubtract` : `Backquote` }
  }) })
  assert.equal(await fixture.service.checkConsoleBind(), true)
  assert.equal(fixture.refreshCount(), 2)
})

function harness(options: {
  settings?: CoreCallResult
  running?: boolean
  getKey?: () => ConsoleKeyCode
  call?: (path: string, init?: RequestInit) => Promise<CoreCallResult>
  refresh?: (service: ConsoleSetupService) => Promise<ListPlayersRefresh>
  verification?: ConsoleVerificationStore
} = {}) {
  let refreshes = 0
  const service: ConsoleSetupService = new ConsoleSetupService({
    callCore: options.call ?? (async path => path === `/v2/meta/get` ? ok({ gameRunning: options.running !== false }) : options.settings ?? config([`True`]))
  }, options.getKey ?? (() => null), async () => {
    refreshes++
    if (options.refresh) return options.refresh(service)
    service.observeListPlayers(output(), `NumpadSubtract`)
    return { result: output(), consoleOutput: { result: output(), key: options.getKey?.() ?? `NumpadSubtract` } }
  }, options.verification)
  return { service, refreshCount: () => refreshes }
}


test(`failed bindings block ordinary input and automatic checks until a successful explicit retry`, async () => {
  const body = (commands: unknown[]) => JSON.stringify({ commands })
  const probe = { type: `console`, command: `ListPlayers`, consoleKey: `NumpadSubtract`, expectClipboard: true }
  let first = true
  const fixture = harness({ refresh: async service => {
    if (first) {
      first = false
      const result = failed(`CLIPBOARD_TIMEOUT`, 1)
      return { result, consoleOutput: { result, key: `NumpadSubtract` } }
    }
    assert.equal(service.getState().commandsBlocked, true)
    assert.equal(service.allowAction(body([{ ...probe, command: `Adminsay hello` }])), false)
    assert.equal(service.allowAction(body([probe, probe])), false)
    assert.equal(service.allowAction(body([{ ...probe, consoleKey: `Backquote` }])), false)
    assert.equal(service.allowAction(body([{ ...probe, expectClipboard: false }])), false)
    assert.equal(service.allowAction(body([probe])), true)
    assert.equal(service.allowAction(body([probe])), false)
    return { result: output(), consoleOutput: { result: output(), key: `NumpadSubtract` } }
  } })
  assert.equal(await fixture.service.checkConsoleBind(), false)
  assert.equal(fixture.refreshCount(), 1)
  assert.equal(fixture.service.allowAction(body([probe])), false)
  assert.equal(await fixture.service.checkConsoleBind(true), true)
  assert.equal(fixture.service.getState().commandsBlocked, false)
  assert.equal(fixture.service.allowAction(body([{ ...probe, command: `Adminsay hello` }])), true)
})

test(`an interrupted retry stays blocked, while changing the configured key still requires verification`, async () => {
  let key: ConsoleKeyCode = `NumpadSubtract`
  let first = true
  const fixture = harness({ getKey: () => key, refresh: async () => {
    if (!first) return { result: failed(`OUTPUT_INTERRUPTED`) }
    first = false
    const result = failed(`CLIPBOARD_TIMEOUT`, 1)
    return { result, consoleOutput: { result, key } }
  } })
  assert.equal(await fixture.service.checkConsoleBind(), false)
  await assert.rejects(fixture.service.checkConsoleBind(true))
  assert.equal(fixture.service.getState().commandsBlocked, true)
  assert.equal(fixture.service.allowAction(JSON.stringify({ commands: [] })), false)
  assert.equal(await fixture.service.checkConsoleBind(), false)
  assert.equal(fixture.refreshCount(), 2)
  key = `Backquote`
  fixture.service.settingsChanged()
  assert.equal(fixture.service.getState().commandsBlocked, true)
  fixture.service.observeListPlayers(failed(`CLIPBOARD_TIMEOUT`, 1), `NumpadSubtract`)
  assert.equal(fixture.service.getState().commandsBlocked, true)
})

test(`explicit retry starts a probe after joining an already blocked background request`, async () => {
  const fixture = harness({ refresh: async service => {
    if (fixture.refreshCount() === 1) return { result: failed(`CONSOLE_SETUP_REQUIRED`) }
    assert.equal(service.allowAction(JSON.stringify({ commands: [{ type: `console`, command: `ListPlayers`,
      consoleKey: `NumpadSubtract`, expectClipboard: true }] })), true)
    return { result: output(), consoleOutput: { result: output(), key: `NumpadSubtract` } }
  } })
  fixture.service.observeListPlayers(failed(`CLIPBOARD_TIMEOUT`, 1), `NumpadSubtract`)
  assert.equal(await fixture.service.checkConsoleBind(true), true)
  assert.equal(fixture.refreshCount(), 2)
})

const probeBody = JSON.stringify({ commands: [{ type: `console`, command: `ListPlayers`, consoleKey: `NumpadSubtract`, expectClipboard: true }] })
const messageBody = JSON.stringify({ commands: [{ type: `console`, command: `Adminsay hello`, consoleKey: `NumpadSubtract` }] })

test(`ordinary commands require both console enablement and a verified key in either result order`, async () => {
  for (const keyFirst of [false, true]) {
    const { service } = harness()
    assert.equal(service.getState().commandsBlocked, true)
    assert.equal(service.allowAction(messageBody), false)
    assert.equal(service.allowAction(probeBody), false)
    if (keyFirst) service.observeListPlayers(output(), `NumpadSubtract`)
    else await service.checkConsoleEnabled()
    assert.equal(service.getState().commandsBlocked, true)
    assert.equal(service.allowAction(messageBody), false)
    if (keyFirst) await service.checkConsoleEnabled()
    else {
      assert.equal(service.allowAction(probeBody), true)
      service.observeListPlayers(output(), `NumpadSubtract`)
    }
    assert.equal(service.getState().commandsBlocked, false)
    assert.equal(service.allowAction(messageBody), true)
  }
})

test(`disabled or unreadable configuration blocks even a verified key and prevents diagnostic input`, async () => {
  for (const settings of [config(undefined), config([`False`]), failed(`CONFIG_READ_FAILED`)]) {
    const fixture = harness({ settings })
    fixture.service.observeListPlayers(output(), `NumpadSubtract`)
    await fixture.service.checkConsoleEnabled().catch(() => undefined)
    assert.equal(fixture.service.getState().commandsBlocked, true)
    assert.equal(fixture.service.allowAction(messageBody), false)
    assert.equal(fixture.service.allowAction(probeBody), false)
    await fixture.service.checkConsoleBind(true).catch(() => undefined)
    assert.equal(fixture.refreshCount(), 0)
    assert.notEqual(fixture.service.getState().binding.status, `checking`)
  }
})

test(`configuration changes revoke command permission while routine timeout leaves a verified key intact`, async () => {
  let settings = config([`True`])
  const { service } = harness({ call: async () => settings })
  await service.checkConsoleEnabled()
  service.observeListPlayers(output(), `NumpadSubtract`)
  settings = config([`False`])
  await service.checkConsoleEnabled()
  assert.equal(service.allowAction(messageBody), false)
  const disabledIssue = service.getState().commandIssue
  settings = failed(`CONFIG_READ_FAILED`)
  await assert.rejects(service.checkConsoleEnabled())
  assert.equal(service.allowAction(messageBody), false)
  settings = config([`True`])
  await service.checkConsoleEnabled()
  assert.equal(service.allowAction(messageBody), true)
  service.observeListPlayers(failed(`CLIPBOARD_TIMEOUT`, 1), `NumpadSubtract`)
  await service.checkConsoleEnabled()
  assert.equal(service.allowAction(messageBody), true)
  assert.notEqual(service.getState().commandIssue, disabledIssue)
})

test(`refreshing successful checks retains their confirmed permission until a result changes`, async () => {
  const { service } = harness()
  await service.checkConsoleBind()
  assert.equal(service.getState().commandsBlocked, false)
  const states: boolean[] = []
  service.subscribe(state => states.push(state.commandsBlocked))
  await service.checkConsoleEnabled()
  await service.checkConsoleBind()
  assert.ok(states.length > 0)
  assert.ok(states.every(blocked => !blocked))
  service.stop()
  assert.equal(service.getState().binding.status, `passed`)
  assert.equal(service.allowAction(messageBody), false)
})

test(`routine clipboard timeouts preserve a verified key and never diagnose an unchecked key`, async () => {
  const { service } = harness()
  service.observeListPlayers(failed(`CLIPBOARD_TIMEOUT`, 1), `NumpadSubtract`)
  assert.equal(service.getState().binding.status, `unchecked`)
  await service.checkConsoleEnabled()
  service.observeListPlayers(output(), `NumpadSubtract`)
  service.observeListPlayers(failed(`CLIPBOARD_TIMEOUT`, 1), `NumpadSubtract`)
  assert.equal(service.getState().binding.status, `passed`)
  assert.equal(service.allowAction(messageBody), true)
})

test(`a saved pass is loaded for its key and an interrupted explicit recheck preserves it`, async () => {
  const store = new ConsoleVerificationStore()
  store.markPassed(`NumpadSubtract`)
  let key: ConsoleKeyCode = `NumpadSubtract`
  const fixture = harness({ getKey: () => key, verification: store, refresh: async () => ({ result: failed(`OUTPUT_INTERRUPTED`) }) })
  await fixture.service.loadVerification()
  assert.equal(fixture.service.getState().binding.status, `passed`)
  await fixture.service.checkConsoleEnabled()
  await assert.rejects(fixture.service.checkConsoleBind(true))
  assert.equal(fixture.service.getState().binding.status, `passed`)
  assert.equal(fixture.service.allowAction(messageBody), true)
  key = `Backquote`
  fixture.service.settingsChanged()
  assert.equal(fixture.service.getState().binding.status, `unchecked`)
  key = `NumpadSubtract`
  fixture.service.settingsChanged()
  assert.equal(fixture.service.getState().binding.status, `passed`)
})

test(`a failed explicit recheck revokes the saved pass while ordinary success cannot undo it`, async () => {
  const store = new ConsoleVerificationStore()
  store.markPassed(`NumpadSubtract`)
  const fixture = harness({ verification: store, refresh: async () => ({
    result: failed(`CLIPBOARD_TIMEOUT`, 1), consoleOutput: { result: failed(`CLIPBOARD_TIMEOUT`, 1), key: `NumpadSubtract` }
  }) })
  await fixture.service.loadVerification()
  assert.equal(await fixture.service.checkConsoleBind(true), false)
  assert.equal(store.has(`NumpadSubtract`), false)
  fixture.service.observeListPlayers(output(), `NumpadSubtract`)
  assert.equal(fixture.service.getState().binding.status, `failed`)
})

test(`corrupt or stale verification records allow startup unchecked and can be replaced by a valid pass`, async () => {
  const directory = await mkdtemp(join(tmpdir(), `spellbook-console-startup-`))
  try {
    for (const content of [`{broken`, JSON.stringify({ version: 0, verifiedKeys: [`NumpadSubtract`] })]) {
      const path = join(directory, `verification.json`)
      await writeFile(path, content)
      const store = new ConsoleVerificationStore(path)
      const { service } = harness({ verification: store })
      await service.loadVerification()
      assert.equal(service.getState().binding.status, `unchecked`)
      await service.checkConsoleEnabled()
      service.observeListPlayers(output(), `NumpadSubtract`)
      await service.flushVerification()
      assert.equal(service.getState().binding.status, `passed`)
      assert.deepEqual(JSON.parse(await readFile(path, `utf8`)), { version: 1, verifiedKeys: [`NumpadSubtract`] })
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test(`an unavailable manual recheck retains a previously verified key`, async () => {
  const store = new ConsoleVerificationStore()
  store.markPassed(`NumpadSubtract`)
  const { service } = harness({ verification: store, running: false })
  await service.loadVerification()
  await assert.rejects(service.checkConsoleBind(true))
  assert.equal(service.getState().binding.status, `passed`)
  assert.equal(store.has(`NumpadSubtract`), true)
})
