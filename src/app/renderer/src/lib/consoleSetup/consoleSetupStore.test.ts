import assert from 'node:assert/strict'
import test from 'node:test'
import { get } from 'svelte/store'
import type { ConsoleSetupApi, ConsoleSetupState } from '../../../../shared/consoleSetup'
import { initialConsoleSetupState } from '../../../../shared/consoleSetup'
import { createConsoleSetupStore } from './consoleSetupStore'

test(`a late initial read cannot replace newer console status or survive logout`, async () => {
  const fixture = harness()
  fixture.store.sync(true)
  fixture.emit({ ...initialConsoleSetupState(), enabled: { status: `failed`, message: `missing` } })
  fixture.resolve(initialConsoleSetupState())
  await fixture.store.refresh()
  assert.equal(get(fixture.store).enabled.status, `failed`)
  fixture.store.sync(false)
  fixture.emit({ ...initialConsoleSetupState(), binding: { status: `failed`, message: `old result` } })
  assert.equal(get(fixture.store).binding.status, `unchecked`)
  assert.equal(fixture.removed(), 1)
})

test(`tile operations expose bridge failures as unavailable checks`, async () => {
  const fixture = harness()
  fixture.resolve(initialConsoleSetupState())
  fixture.store.sync(true)
  await fixture.store.run(`checkConsoleBind`)
  assert.equal(get(fixture.store).binding.status, `unavailable`)
})

test(`a failed key check hides internal clipboard diagnostics without changing its result`, async () => {
  const technicalMessage = `No valid clipboard output arrived after the Command was submitted.`
  const snapshot: ConsoleSetupState = { ...initialConsoleSetupState(), setupLoaded: true,
    binding: { status: `failed`, message: technicalMessage } }
  const fixture = harness({ consoleSetupState: async () => snapshot })
  fixture.store.sync(true)
  await fixture.store.refresh()

  assert.equal(get(fixture.store).binding.status, `failed`)
  assert.equal(get(fixture.store).commandsBlocked, true)
  assert.notEqual(get(fixture.store).binding.message, technicalMessage)
  assert.doesNotMatch(get(fixture.store).binding.message, /clipboard|Command/u)
  assert.equal(snapshot.binding.message, technicalMessage)

  const userMessage = `Start Chivalry 2 to check the console key.`
  fixture.emit({ ...snapshot, binding: { status: `unavailable`, message: userMessage } })
  assert.equal(get(fixture.store).binding.message, userMessage)
})

test(`failed configuration requests clear previous success for both onboarding checks`, async () => {
  const fixture = harness({ checkConsoleEnabled: async () => { throw new Error(`Bridge unavailable`) } })
  fixture.resolve({ ...initialConsoleSetupState(), commandsBlocked: false, commandIssue: null, windowMode: { status: `passed`, message: `Windowed` } })
  fixture.store.sync(true)
  await fixture.store.refresh()
  assert.equal(get(fixture.store).windowMode.status, `passed`)
  await fixture.store.run(`checkConsoleEnabled`)
  assert.equal(get(fixture.store).enabled.status, `unavailable`)
  assert.equal(get(fixture.store).windowMode.status, `unavailable`)
  assert.equal(get(fixture.store).commandsBlocked, true)
  assert.ok(get(fixture.store).commandIssue)
})

function harness(overrides: Partial<ConsoleSetupApi> = {}) {
  let listener = (_state: ConsoleSetupState) => {}
  let resolve!: (state: ConsoleSetupState) => void
  const pending = new Promise<ConsoleSetupState>(done => { resolve = done })
  let removed = 0
  let completions = 0
  const api: ConsoleSetupApi = {
    consoleSetupState: () => pending,
    onConsoleSetupStateChanged: callback => { listener = callback; return () => { removed++ } },
    checkConsoleBind: async () => { throw new Error(`Core unavailable`) },
    checkConsoleEnabled: async () => true,
    enableConsole: async () => true,
    recordConsoleKey: async () => true,
    setConsoleLayout: async () => true,
    refreshKeyboardLayouts: async () => initialConsoleSetupState(),
    retryKeyboardLayoutRestore: async () => true,
    ...overrides
  }
  return { store: createConsoleSetupStore(() => api, () => { completions++ }), emit: (state: ConsoleSetupState) => listener(state), resolve, removed: () => removed, completions: () => completions }
}

test(`required setup announces completion once after the checks and restoration finish`, async () => {
  const fixture = harness()
  const required = { ...initialConsoleSetupState(), setupLoaded: true }
  const ready: ConsoleSetupState = { ...required, setupRequired: false, commandsBlocked: false,
    enabled: { status: `passed`, message: `Enabled` }, binding: { status: `passed`, message: `Verified` } }
  fixture.resolve(required)
  fixture.store.sync(true)
  await fixture.store.refresh()
  fixture.emit({ ...required, binding: { status: `failed`, message: `Try again` } })
  fixture.emit({ ...ready, commandsBlocked: true, restorationFault: `Restoration pending` })
  assert.equal(fixture.completions(), 0)
  fixture.emit(ready)
  fixture.emit(ready)
  assert.equal(fixture.completions(), 1)
})

test(`saved setup and a new signed-in session do not announce an earlier completion`, async () => {
  const fixture = harness()
  const ready: ConsoleSetupState = { ...initialConsoleSetupState(), setupLoaded: true, setupRequired: false,
    commandsBlocked: false, enabled: { status: `passed`, message: `Enabled` }, binding: { status: `passed`, message: `Verified` } }
  fixture.resolve(ready)
  fixture.store.sync(true)
  await fixture.store.refresh()
  assert.equal(fixture.completions(), 0)
  fixture.emit({ ...ready, setupRequired: true })
  fixture.store.sync(false)
  fixture.emit(ready)
  fixture.store.sync(true)
  await fixture.store.refresh()
  assert.equal(fixture.completions(), 0)
})

test(`setup preview opens and closes without changing the saved binding or submitting input`, async () => {
  let inputs = 0
  const snapshot = configuredState()
  const fixture = harness({ consoleSetupState: async () => snapshot,
    checkConsoleBind: async () => { inputs++; return true },
    recordConsoleKey: async () => { inputs++; return true },
    setConsoleLayout: async () => { inputs++; return true } })
  fixture.store.sync(true)
  await fixture.store.refresh()
  fixture.store.openPreview()
  assert.equal(get(fixture.store.preview), true)
  assert.deepEqual(get(fixture.store), snapshot)
  fixture.store.closePreview()
  assert.equal(get(fixture.store.preview), false)
  assert.deepEqual(get(fixture.store), snapshot)
  assert.equal(inputs, 0)
  assert.equal(fixture.completions(), 0)
})

test(`the mounted preview stays open after verification until Continue and can be replayed`, async () => {
  let success = false
  const fixture = harness({ consoleSetupState: async () => configuredState(), checkConsoleBind: async () => success })
  fixture.store.sync(true)
  await fixture.store.refresh()
  fixture.store.openPreview()
  fixture.store.setModalOpen(true)
  await fixture.store.run(`checkConsoleEnabled`)
  assert.equal(get(fixture.store.preview), true)
  await fixture.store.run(`checkConsoleBind`)
  assert.equal(get(fixture.store.preview), true)
  assert.equal(fixture.completions(), 0)
  success = true
  await fixture.store.run(`checkConsoleBind`)
  assert.equal(get(fixture.store.preview), true)
  assert.equal(fixture.completions(), 0)
  assert.equal(fixture.store.continueSetup(), true)
  assert.equal(get(fixture.store.preview), false)
  assert.equal(fixture.completions(), 1)
  fixture.store.openPreview()
  fixture.store.setModalOpen(true)
  await fixture.store.run(`checkConsoleBind`)
  assert.equal(fixture.store.continueSetup(), true)
  assert.equal(get(fixture.store.preview), false)
  assert.equal(fixture.completions(), 2)
})

test(`returning from a ready or unready preview also closes its modal`, async () => {
  for (const snapshot of [configuredState(), { ...configuredState(), commandsBlocked: true,
    binding: { status: `failed` as const, message: `Try again` } }, { ...initialConsoleSetupState(), setupLoaded: true }]) {
    const fixture = harness({ consoleSetupState: async () => snapshot })
    fixture.store.sync(true)
    await fixture.store.refresh()
    fixture.store.openPreview()
    fixture.store.setModalOpen(true)
    fixture.store.closePreview()

    assert.equal(get(fixture.store.preview), false)
    assert.equal(get(fixture.store.modalOpen), false)
    assert.deepEqual(get(fixture.store), snapshot)
    assert.equal(fixture.completions(), 0)
  }
})

test(`a required modal waits for readiness and an explicit Continue`, async () => {
  const fixture = harness()
  const required = { ...initialConsoleSetupState(), setupLoaded: true }
  fixture.resolve(required)
  fixture.store.sync(true)
  await fixture.store.refresh()
  fixture.store.setModalOpen(true)
  fixture.store.closePreview()
  assert.equal(get(fixture.store.modalOpen), true)
  assert.equal(fixture.store.continueSetup(), false)

  const ready = configuredState()
  fixture.emit({ ...ready, commandsBlocked: true, restorationFault: `Restoration pending` })
  assert.equal(fixture.store.continueSetup(), false)
  fixture.emit(ready)
  fixture.emit(ready)
  assert.equal(get(fixture.store.modalOpen), true)
  assert.equal(get(fixture.store.ready), true)
  assert.equal(fixture.completions(), 0)

  fixture.emit({ ...required, recordRequired: false })
  assert.equal(get(fixture.store.ready), false)
  assert.equal(fixture.store.continueSetup(), false)
  fixture.emit(ready)
  assert.equal(fixture.store.continueSetup(), true)
  assert.equal(get(fixture.store.modalOpen), false)
  assert.equal(fixture.completions(), 1)
  assert.equal(fixture.store.continueSetup(), false)
})

test(`ending the signed-in session clears an open modal and prevents late completion`, async () => {
  const fixture = harness({ consoleSetupState: async () => configuredState() })
  fixture.store.sync(true)
  await fixture.store.refresh()
  fixture.store.setModalOpen(true)
  fixture.store.sync(false)
  fixture.emit(configuredState())

  assert.equal(get(fixture.store.modalOpen), false)
  assert.equal(get(fixture.store.ready), false)
  assert.equal(fixture.store.continueSetup(), false)
  assert.equal(fixture.completions(), 0)
})

test(`closing or ending a preview session prevents a late check from completing another replay`, async () => {
  let finish!: (success: boolean) => void
  const pending = new Promise<boolean>(resolve => { finish = resolve })
  const fixture = harness({ consoleSetupState: async () => configuredState(), checkConsoleBind: () => pending })
  fixture.store.openPreview()
  assert.equal(get(fixture.store.preview), false)
  fixture.store.sync(true)
  await fixture.store.refresh()
  fixture.store.openPreview()
  const checking = fixture.store.run(`checkConsoleBind`)
  fixture.store.closePreview()
  fixture.store.openPreview()
  finish(true)
  await checking
  assert.equal(get(fixture.store.preview), true)
  assert.equal(fixture.completions(), 0)
  fixture.store.sync(false)
  assert.equal(get(fixture.store.preview), false)
})

function configuredState(): ConsoleSetupState {
  return { ...initialConsoleSetupState(), setupLoaded: true, setupRequired: false, recordRequired: false,
    commandsBlocked: false, commandIssue: null, setupReason: null, layoutCatalogStatus: `ready`,
    enabled: { status: `passed`, message: `Enabled` }, binding: { status: `passed`, message: `Verified` },
    selectedLayout: { layoutId: `00000414`, source: `detected` } }
}

test(`signing out while a replay check is pending suppresses its completion`, async () => {
  let finish!: (success: boolean) => void
  const pending = new Promise<boolean>(resolve => { finish = resolve })
  const fixture = harness({ consoleSetupState: async () => configuredState(), checkConsoleBind: () => pending })
  fixture.store.sync(true)
  await fixture.store.refresh()
  fixture.store.openPreview()
  const checking = fixture.store.run(`checkConsoleBind`)
  fixture.store.sync(false)
  finish(true)
  await checking
  assert.equal(get(fixture.store.preview), false)
  assert.equal(fixture.completions(), 0)
})

test(`layout changes persist through the API and a subsequent check replaces manual selection`, async () => {
  let snapshot: ConsoleSetupState = { ...initialConsoleSetupState(), setupLoaded: true, setupRequired: false,
    selectedLayout: { layoutId: `00000414`, source: `detected` } }
  const fixture = harness({ consoleSetupState: async () => snapshot,
    setConsoleLayout: async layoutId => { snapshot = { ...snapshot, selectedLayout: { layoutId, source: `manual` } }; return true },
    checkConsoleBind: async () => { snapshot = { ...snapshot, selectedLayout: { layoutId: `00000414`, source: `detected` } }; return true }
  })
  fixture.store.sync(true)
  await fixture.store.refresh()
  await fixture.store.setLayout(`00000409`)
  assert.equal(get(fixture.store).selectedLayout?.source, `manual`)
  await fixture.store.run(`checkConsoleBind`)
  assert.deepEqual(get(fixture.store).selectedLayout, { layoutId: `00000414`, source: `detected` })
})
