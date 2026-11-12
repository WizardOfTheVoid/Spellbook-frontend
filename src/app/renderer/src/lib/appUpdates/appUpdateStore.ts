import { tick } from 'svelte'
import { writable } from 'svelte/store'
import type { AppUpdateApi, AppUpdateState } from '../../../../shared/appUpdate'
import { unsavedChanges } from '../utils/unsavedChanges'

type Options = {
  api: () => AppUpdateApi | undefined
  canLeave: () => Promise<boolean>
}

export function createAppUpdateStore(options: Options) {
  const idle: AppUpdateState = {
    phase: `idle`,
    version: null,
    required: false,
    percent: null,
    error: null,
    restartRequired: false,
  }
  let view = { state: idle, open: false, pending: false, confirming: false }
  const store = writable(view)
  let generation = 0
  let connected = false
  const update = (next: Partial<typeof view>) => {
    view = { ...view, ...next }
    store.set(view)
  }
  const accept = (state: AppUpdateState) => update({ state, open: view.open || state.restartRequired || state.required })
  const fail = () =>
    accept({
      ...view.state,
      phase: `error`,
      error: view.state.restartRequired
        ? `SpellBook needs to restart before you can continue.`
        : `The update could not finish. Try again or open the download page.`,
    })

  async function restart(install: boolean): Promise<void> {
    const api = options.api()
    const state = view.state
    if (
      !connected ||
      !api ||
      view.pending ||
      (install ? state.phase !== `ready` || state.restartRequired : !state.restartRequired || state.phase !== `error`)
    )
      return
    const request = generation
    update({ pending: true, confirming: true })
    try {
      if (!(await options.canLeave()) || request !== generation || !connected) return
      update({ confirming: false })
      if (
        install
          ? view.state.phase !== `ready` || view.state.version !== state.version || view.state.restartRequired
          : !view.state.restartRequired || view.state.phase !== `error`
      )
        return
      if (install) await api.installUpdate()
      else await api.restartApplication()
    } catch {
      if (request === generation) fail()
    } finally {
      if (request === generation) update({ pending: false, confirming: false })
    }
  }

  return {
    subscribe: store.subscribe,
    connect(): () => void {
      if (connected) return () => undefined
      const api = options.api()
      if (!api) return () => undefined
      connected = true
      const connection = ++generation
      let eventReceived = false
      const stop = api.onUpdateChanged((state) => {
        if (connection !== generation) return
        eventReceived = true
        accept(state)
      })
      void (async () => {
        try {
          const state = await api.getUpdateState()
          if (connection === generation && !eventReceived) accept(state)
        } catch {
          if (connection === generation && !eventReceived) fail()
        }
      })()
      return () => {
        if (connection !== generation) return
        generation += 1
        connected = false
        stop()
        update({ pending: false, confirming: false })
      }
    },
    open: () => update({ open: true }),
    close: () => {
      if (!view.state.restartRequired && !view.state.required && !view.pending) update({ open: false })
    },
    install: () => restart(true),
    restart: () => restart(false),
    async retry(): Promise<void> {
      if (!connected || view.state.restartRequired || [`checking`, `downloading`].includes(view.state.phase)) return
      try {
        await options.api()?.checkForUpdate()
      } catch {
        fail()
      }
    },
    async openDownload(): Promise<void> {
      try {
        await options.api()?.openUpdatePage()
      } catch {
        fail()
      }
    },
  }
}

export const appUpdates = createAppUpdateStore({
  api: () => (typeof window === `undefined` ? undefined : window.chivOverlay),
  canLeave: async () => {
    await tick()
    return unsavedChanges.canLeave()
  },
})
