import assert from 'node:assert/strict'
import test from 'node:test'
import type { ConsoleKeyCode } from '../../shared/consoleKey'
import type { CoreCallResult } from '../types'
import { ConsoleSetupService } from './consoleSetupService'
import { ConsoleBindingStore } from './consoleBindingStore'

const ok = (data: unknown, requestId?: string): CoreCallResult => ({ ok: true, status: 200, statusText: `OK`, data: { ok: true, requestId, data } })
const output = (id: string, layout = `00000414`) => ok({ status: `completed`, sent: true, sentCommands: 1, players: [], rawText: `ServerName: Test`, keyboardLayout: { id: layout, displayName: layout } }, id)
const installed = [{ id: `00000409`, displayName: `US` }, { id: `00000414`, displayName: `Norwegian` }]
const binding = { key: `Minus`, layoutId: `00000414`, checkedAt: `2026-10-22T13:01:00.000Z` } as const

function harness(options: { store?: ConsoleBindingStore, probe?: (id: string, key: ConsoleKeyCode, signal: AbortSignal) => Promise<CoreCallResult> } = {}) {
  let key: ConsoleKeyCode = `Minus`
  let layouts = installed
  let running = true
  let settings: Record<string, unknown> = { bConsoleEnabled: [`True`], FullscreenMode: [`1`], LastConfirmedFullscreenMode: [`2`] }
  const calls: string[] = []
  const store = options.store ?? new ConsoleBindingStore()
  const service = new ConsoleSetupService({ callCore: async (path, init) => {
    calls.push(`${init?.method} ${path}`)
    if (path === `/v3/keyboard-layouts`) return ok({ capabilityVersion: 1, installed: layouts, restorationFault: null })
    if (path === `/v2/meta/get`) return ok({ gameRunning: running })
    return ok({ sections: { [`/Script/TBL.TBLGameUserSettings`]: settings } })
  } }, () => key, { run: options.probe ?? (async id => output(id)) }, store, async value => { key = value })
  return { service, store, calls, setLayouts: (value: typeof layouts) => { layouts = value }, setRunning: (value: boolean) => { running = value },
    setSettings: (value: typeof settings) => { settings = value }, changeKey: (value: ConsoleKeyCode) => { key = value; service.settingsChanged() } }
}

test(`console enablement and both window modes require exact single values`, async () => {
  const fixture = harness()
  for (const values of [undefined, [`False`], [`true`], [`True`, `True`], [`True`]]) {
    fixture.setSettings({ bConsoleEnabled: values, FullscreenMode: [`1`], LastConfirmedFullscreenMode: [`2`] })
    assert.equal(await fixture.service.checkConsoleEnabled(), values?.length === 1 && values[0] === `True`)
    assert.equal(fixture.service.getState().windowMode.status, `passed`)
  }
  for (const field of [`FullscreenMode`, `LastConfirmedFullscreenMode`]) {
    for (const value of [undefined, [], [`0`], [`3`], [`1`, `2`], [1]]) {
      fixture.setSettings({ bConsoleEnabled: [`True`], FullscreenMode: [`1`], LastConfirmedFullscreenMode: [`1`], [field]: value })
      assert.equal(await fixture.service.checkConsoleEnabled(), true)
      assert.equal(fixture.service.getState().windowMode.status, `failed`)
    }
  }
})
test(`enable writes only the console setting and verifies readback`, async () => {
  const fixture = harness()
  assert.equal(await fixture.service.enableConsole(), true)
  assert.deepEqual(fixture.calls, [`PATCH /chivalry2/gameusersettings/?key=bConsoleEnabled&value=True`, `GET /chivalry2/gameusersettings/`])
  fixture.setSettings({ bConsoleEnabled: [`False`] })
  assert.equal(await fixture.service.enableConsole(), false)
})
test(`missing layout requires explicit same-key recording and background observation cannot unlock`, async () => {
  const { service } = harness()
  await service.loadVerification()
  service.observeListPlayers(output(`background`), `Minus`)
  assert.equal(service.getState().setupRequired, true)
  assert.equal(await service.checkConsoleBind(), false)
  assert.equal(await service.recordConsoleKey(`Minus`), true)
  assert.equal(service.getState().commandsBlocked, true)
  assert.equal(await service.checkConsoleBind(), true)
  assert.equal(service.getState().setupRequired, false)
  assert.equal(service.getState().lastVerifiedBinding?.layoutId, `00000414`)
})
test(`only the exact explicit probe bypasses the gate with background workers stopped`, async () => {
  let service: ConsoleSetupService
  const fixture = harness({ probe: async id => {
    const body = (requestId: string) => JSON.stringify({ id: requestId, author: `user`, priority: `normal`, commands: [{ type: `console`, command: `ListPlayers`, consoleKey: `Minus`, expectClipboard: true, keyboardLayoutId: `detect` }] })
    assert.equal(service.allowAction(body(`background`)), false)
    assert.equal(service.allowAction(body(id)), true)
    return output(id)
  } })
  service = fixture.service
  await service.loadVerification()
  await service.recordConsoleKey(`Minus`)
  assert.equal(await service.checkConsoleBind(), true)
})
test(`manual override is immediate and failed checks replace it with the detected layout`, async () => {
  const store = new ConsoleBindingStore()
  await store.markPassed(binding)
  const fixture = harness({ store, probe: async id => ({ ...output(id, `00000409`), ok: false }) })
  await fixture.service.loadVerification()
  await fixture.service.checkConsoleEnabled()
  assert.equal(await fixture.service.setConsoleLayout(`00000409`), true)
  assert.deepEqual(fixture.service.getState().selectedLayout, { layoutId: `00000409`, source: `manual` })
  assert.deepEqual(fixture.service.getState().lastVerifiedBinding, binding)
  assert.equal(await fixture.service.checkConsoleBind(), false)
  assert.equal(store.getOverride(`Minus`), null)
  assert.deepEqual(fixture.service.getState().selectedLayout, { layoutId: `00000409`, source: `detected` })
})
test(`no game still clears the override without inventing a detection`, async () => {
  const store = new ConsoleBindingStore()
  await store.markPassed(binding)
  const fixture = harness({ store })
  await fixture.service.loadVerification()
  await fixture.service.setConsoleLayout(`00000409`)
  fixture.setRunning(false)
  assert.equal(await fixture.service.checkConsoleBind(), false)
  assert.equal(store.getOverride(`Minus`), null)
  assert.equal(fixture.service.getState().selectedLayout?.layoutId, `00000414`)
})
test(`manual selection cannot finish initial setup and a removed selection requires repair`, async () => {
  const fixture = harness()
  await fixture.service.loadVerification()
  assert.equal(await fixture.service.setConsoleLayout(`00000409`), false)
  await fixture.service.recordConsoleKey(`Minus`)
  await fixture.service.checkConsoleBind()
  fixture.setLayouts([installed[0]])
  await fixture.service.refreshKeyboardLayouts()
  assert.equal(fixture.service.getState().setupRequired, true)
  assert.equal(fixture.service.getState().setupReason, `layoutUnavailable`)
})
test(`logout or a newer key makes late probe output unable to persist`, async () => {
  for (const invalidate of [`logout`, `key`]) {
    let finish!: (value: CoreCallResult) => void
    let probeId = ``
    const fixture = harness({ probe: async id => { probeId = id; return new Promise(resolve => { finish = resolve }) } })
    await fixture.service.loadVerification()
    await fixture.service.recordConsoleKey(`Minus`)
    const check = fixture.service.checkConsoleBind()
    await new Promise(resolve => setImmediate(resolve))
    if (invalidate === `logout`) fixture.service.stop()
    else fixture.changeKey(`F7`)
    finish(output(probeId))
    assert.equal(await check, false)
    assert.equal(fixture.store.get(`Minus`), null)
    assert.equal(fixture.service.getState().commandsBlocked, true)
  }
})
test(`failed persistence cannot unlock setup`, async () => {
  const store = new ConsoleBindingStore()
  store.markPassed = async () => { throw new Error(`disk full`) }
  const fixture = harness({ store })
  await fixture.service.loadVerification()
  await fixture.service.recordConsoleKey(`Minus`)
  assert.equal(await fixture.service.checkConsoleBind(), false)
  assert.equal(fixture.service.getState().setupRequired, true)
  assert.equal(fixture.service.getState().setupReason, `storageUnavailable`)
})
test(`completed setup and manual override survive service restart`, async () => {
  const fixture = harness()
  await fixture.service.loadVerification()
  await fixture.service.recordConsoleKey(`Minus`)
  await fixture.service.checkConsoleBind()
  await fixture.service.setConsoleLayout(`00000409`)
  const next = harness({ store: fixture.store })
  await next.service.loadVerification()
  assert.equal(next.service.getState().setupRequired, false)
  assert.equal(next.service.getState().selectedLayout?.source, `manual`)
})

test(`a failed override clear sends no probe input`, async () => {
  const store = new ConsoleBindingStore()
  await store.markPassed(binding)
  await store.setOverride(`Minus`, `00000409`)
  let probes = 0
  store.clearOverride = async () => { throw new Error(`disk full`) }
  const fixture = harness({ store, probe: async id => { probes++; return output(id) } })
  await fixture.service.loadVerification()
  assert.equal(await fixture.service.checkConsoleBind(), false)
  assert.equal(probes, 0)
  assert.equal(store.getOverride(`Minus`), `00000409`)
  assert.equal(fixture.service.getState().setupReason, `storageUnavailable`)
})

test(`a mismatched probe id cannot pass even with valid output and detected layout`, async () => {
  const fixture = harness({ probe: async () => output(`old-check`) })
  await fixture.service.loadVerification()
  await fixture.service.recordConsoleKey(`Minus`)
  assert.equal(await fixture.service.checkConsoleBind(), false)
  assert.equal(fixture.store.get(`Minus`), null)
})

test(`a cancelled setup check can be retried after resume without waiting for its stale completion`, async () => {
  let finish!: (value: CoreCallResult) => void
  let oldId = ``
  let calls = 0
  const fixture = harness({ probe: async id => {
    if (++calls === 1) { oldId = id; return new Promise(resolve => { finish = resolve }) }
    return output(id)
  } })
  await fixture.service.loadVerification()
  await fixture.service.recordConsoleKey(`Minus`)
  const oldCheck = fixture.service.checkConsoleBind()
  await new Promise(resolve => setImmediate(resolve))
  fixture.service.stop()
  assert.notEqual(fixture.service.getState().binding.status, `checking`)
  fixture.service.start()
  try {
    assert.equal(await fixture.service.recordConsoleKey(`Minus`), true)
    assert.equal(await fixture.service.checkConsoleBind(), true)
    finish(output(oldId, `00000409`))
    assert.equal(await oldCheck, false)
    assert.equal(fixture.store.get(`Minus`)?.layoutId, `00000414`)
    assert.equal(fixture.service.getState().commandsBlocked, false)
  } finally { fixture.service.stop() }
})
