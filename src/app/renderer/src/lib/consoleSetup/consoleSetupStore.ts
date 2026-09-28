import { writable } from 'svelte/store'
import { getCoreApi } from '$lib/core'
import { initialConsoleSetupState, consoleSetupIssue, type ConsoleSetupApi, type ConsoleSetupState } from '../../../../shared/consoleSetup'

type Operation = `checkConsoleEnabled` | `enableConsole` | `checkConsoleBind`

export function createConsoleSetupStore(getApi: () => ConsoleSetupApi) {
  const state = writable(initialConsoleSetupState())
  let active = false
  let revision = 0
  let session = 0
  let unsubscribe = () => {}
  let pending: Promise<void> | null = null

  async function refresh(): Promise<void> {
    if (!active) return
    if (pending) return pending
    const current = revision
    const request = read()
    pending = request
    try { await request }
    finally { if (pending === request) pending = null }

    async function read() {
      try {
        const snapshot = await getApi().consoleSetupState()
        if (active && current === revision) state.set(snapshot)
      } catch (error) {
        if (active && current === revision) unavailable(`enabled`, error)
      }
    }
  }

  function unavailable(check: `enabled` | `binding`, error: unknown) {
    revision++
    const result = {
      status: `unavailable`, message: error instanceof Error ? error.message : `Console setup is unavailable.`
    } as const
    state.update(current => ({ ...current, commandsBlocked: true, commandIssue: consoleSetupIssue, [check]: result, ...(check === `enabled` ? { windowMode: result } : {}) }))
  }

  function sync(next: boolean) {
    if (active === next) return
    active = next
    revision++
    session++
    pending = null
    unsubscribe()
    unsubscribe = () => {}
    if (!active) {
      state.set(initialConsoleSetupState())
      return
    }
    const current = session
    try {
      unsubscribe = getApi().onConsoleSetupStateChanged(snapshot => {
        if (!active || current !== session) return
        revision++
        state.set(snapshot)
      })
      void refresh()
    } catch (error) { unavailable(`enabled`, error) }
  }

  async function run(operation: Operation, retry = false): Promise<void> {
    if (!active) return
    const current = session
    const before = revision
    try {
      await getApi()[operation](retry)
      await refresh()
    } catch (error) {
      if (active && current === session && before === revision) {
        unavailable(operation === `checkConsoleBind` ? `binding` : `enabled`, error)
      }
    }
  }

  return { subscribe: state.subscribe, sync, refresh, run }
}

export const consoleSetup = createConsoleSetupStore(getCoreApi)
