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
  const api: ConsoleSetupApi = {
    consoleSetupState: () => pending,
    onConsoleSetupStateChanged: callback => { listener = callback; return () => { removed++ } },
    checkConsoleBind: async () => { throw new Error(`Core unavailable`) },
    checkConsoleEnabled: async () => true,
    enableConsole: async () => true,
    ...overrides
  }
  return { store: createConsoleSetupStore(() => api), emit: (state: ConsoleSetupState) => listener(state), resolve, removed: () => removed }
}
