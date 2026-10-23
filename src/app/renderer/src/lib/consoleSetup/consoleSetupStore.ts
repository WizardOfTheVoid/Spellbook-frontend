import { get, writable } from 'svelte/store'
import { getCoreApi } from '$lib/core'
import { notifySuccess } from '$lib/notifications/notificationEvents'
import { initialConsoleSetupState, consoleSetupIssue, type ConsoleSetupApi, type ConsoleSetupState } from '../../../../shared/consoleSetup'

type Operation = `checkConsoleEnabled` | `enableConsole` | `checkConsoleBind` | `retryKeyboardLayoutRestore` | `refreshKeyboardLayouts`

export function createConsoleSetupStore(getApi: () => ConsoleSetupApi, onComplete: () => void = () => {}) {
  const state = writable(initialConsoleSetupState())
  const preview = writable(false)
  let active = false
  let revision = 0
  let session = 0
  let unsubscribe = () => {}
  let pending: Promise<void> | null = null
  let completionPending = false
  let previewRevision = 0

  function openPreview() {
    if (!active) return
    previewRevision++
    preview.set(true)
  }

  function closePreview() {
    previewRevision++
    preview.set(false)
  }

  function ready(snapshot: ConsoleSetupState) {
    return snapshot.setupLoaded && !snapshot.setupRequired && !snapshot.commandsBlocked
      && snapshot.binding.status === `passed` && snapshot.enabled.status === `passed`
  }

  function complete() {
    completionPending = false
    closePreview()
    onComplete()
  }

  function apply(snapshot: ConsoleSetupState) {
    if (snapshot.setupLoaded && snapshot.setupRequired) completionPending = true
    state.set(snapshot)
    if (completionPending && ready(snapshot)) complete()
  }

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
        if (active && current === revision) apply(snapshot)
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
      closePreview()
      completionPending = false
      state.set(initialConsoleSetupState())
      return
    }
    const current = session
    try {
      unsubscribe = getApi().onConsoleSetupStateChanged(snapshot => {
        if (!active || current !== session) return
        revision++
        apply(snapshot)
      })
      void refresh()
    } catch (error) { unavailable(`enabled`, error) }
  }

  async function run(operation: Operation, retry = false): Promise<void> {
    if (!active) return
    const current = session
    const before = revision
    const currentPreview = previewRevision
    try {
      const result = operation === `checkConsoleBind` ? await getApi().checkConsoleBind(retry) : await getApi()[operation]()
      await refresh()
      if (operation === `checkConsoleBind` && result === true && active && current === session
        && currentPreview === previewRevision && get(preview) && ready(get(state))) complete()
    } catch (error) {
      if (active && current === session && before === revision) {
        unavailable(operation === `checkConsoleBind` || operation === `retryKeyboardLayoutRestore` ? `binding` : `enabled`, error)
      }
    }
  }

  async function setLayout(layoutId: string): Promise<boolean> {
    if (!active) return false
    const current = session
    try {
      const saved = await getApi().setConsoleLayout(layoutId)
      if (!active || current !== session) return false
      await refresh()
      return saved
    } catch (error) {
      if (active && current === session) unavailable(`binding`, error)
      return false
    }
  }

  return { subscribe: state.subscribe, preview: { subscribe: preview.subscribe }, openPreview, closePreview, sync, refresh, run, setLayout }
}

export const consoleSetup = createConsoleSetupStore(getCoreApi, () => notifySuccess(`Console setup complete`, {
  description: `Your in-game console key and keyboard layout are saved. SpellBook is ready to use.`,
  durationMs: 8000,
  dedupeKey: `console-setup-complete`
}))

export const consoleSetupPreview = consoleSetup.preview
