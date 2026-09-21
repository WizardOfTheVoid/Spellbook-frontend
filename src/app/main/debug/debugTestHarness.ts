import { setImmediate } from 'node:timers/promises'
import type { CoreDebugSnapshot, DebugSessionSnapshot } from '../../shared/debug'
import type { CoreCallResult } from '../types'
import { DebugSession, type DebugSessionDependencies } from './debugSession'

export const envelope = (data: unknown): CoreCallResult => ({ ok: true, status: 200, statusText: `OK`, data: { ok: true, data } })
export const unavailable = (): CoreCallResult => ({ ok: false, status: 0, statusText: `CORE_UNAVAILABLE`, data: null, error: { code: `CORE_UNAVAILABLE`, message: `offline` } })
export const flush = async () => { await setImmediate() }

export function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(complete => { resolve = complete })
  return { promise, resolve }
}

export function snapshot(): CoreDebugSnapshot {
  return {
    status: {
      mouseShowing: false,
      runtime: { enabled: true, gameRunning: true, appRunning: true },
      focus: { gameFocused: true, appFocused: false, gameReady: true, reason: null, overlayState: `unknown` },
      input: { available: true, keyboardActive: false, mouseActive: false, idleMs: 3000, isChatting: false, timeSinceChattingMs: null, chatCooldownRemainingMs: 0 },
      execution: { canExecuteCommand: true, reason: null },
      queue: { state: `idle`, pendingActions: 0, id: null, author: null, priority: null, cursor: 0, commandCount: 0, remainingMs: null, reason: null, lastResult: null },
      lastCommand: null,
      recentCommands: []
    },
    sequence: 0, events: [], eventsLost: false, armed: false,
    queue: { paused: false, actions: [] }, execution: { phase: `idle` },
    input: { heldKeys: [], heldButtons: [], injectedKeyboardEvents: 0, injectedMouseEvents: 0 },
    windows: { game: {}, app: {} }, settings: { ActionLowTtlMs: 10000 }
  }
}

export function harness(extra: Partial<DebugSessionDependencies> = {}) {
  const core = snapshot()
  let time = 1000
  let id = 0
  const timers = new Map<number, { due: number, callback: () => void }>()
  const requests: { path: string, body: any, signal?: AbortSignal | null }[] = []
  const states: DebugSessionSnapshot[] = []
  const producerChanges: { producer: string, paused: boolean }[] = []
  const responses: { get?: () => Promise<CoreCallResult>, action?: () => Promise<CoreCallResult>, mutation?: () => Promise<CoreCallResult> } = {}
  const session = new DebugSession({
    http: { callCore: async (path, init) => {
      const body = init?.body ? JSON.parse(init.body as string) : undefined
      requests.push({ path, body, signal: init?.signal })
      if (path.startsWith(`/v3/debug?`)) return responses.get ? responses.get() : envelope(structuredClone(core))
      if (path === `/v3/actions`) return responses.action ? responses.action() : envelope({ status: `completed`, sentCommands: 1, commandResults: [{ index: 0, sent: true }] })
      if (responses.mutation) return responses.mutation()
      if (path === `/v3/debug/session`) core.armed = body.enabled
      if (path === `/v3/debug/settings`) {
        core.settings = body.reset ? snapshot().settings : { ...core.settings, ...body.values }
        return envelope(structuredClone(core.settings))
      }
      return envelope({ armed: core.armed, sequence: core.sequence })
    } },
    appTarget: () => ({ processId: 42, windowHandle: `0x123` }), getConsoleKey: () => `F6`,
    setProducerPaused: async (producer, paused) => { producerChanges.push({ producer, paused }) },
    publish: state => states.push(state), now: () => time,
    timers: {
      setTimeout: (callback, milliseconds) => { const timer = ++id
        timers.set(timer, { due: time + milliseconds, callback })
        return timer
      },
      clearTimeout: timer => { timers.delete(timer as number) }
    },
    ...extra
  })
  const advance = async (milliseconds: number) => {
    time += milliseconds
    const due = [...timers].filter(([, timer]) => timer.due <= time)
    for (const [key, timer] of due) if (timers.delete(key)) timer.callback()
    await flush()
  }
  return { session, core, requests, states, producerChanges, responses, timers, advance }
}
