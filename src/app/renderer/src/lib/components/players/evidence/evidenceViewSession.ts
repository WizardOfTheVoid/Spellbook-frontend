import { writable } from 'svelte/store'

type ViewSessionState = { viewCount: number, recording: boolean, recorded: boolean }
type ViewSessionDependencies = {
  record(id: number, sessionId: string, watchedMs: number): Promise<{ viewCount: number }>
  onRecorded?(viewCount: number): void
  sessionId?: string
}

export function createEvidenceViewSession(evidence: { id: number, viewCount?: number }, deps: ViewSessionDependencies) {
  const sessionId = deps.sessionId ?? crypto.randomUUID()
  let current: ViewSessionState = { viewCount: evidence.viewCount ?? 0, recording: false, recorded: false }
  const state = writable(current)
  let disposed = false
  const change = (patch: Partial<ViewSessionState>) => {
    current = { ...current, ...patch }
    state.set(current)
  }

  async function record(): Promise<void> {
    if (disposed || current.recording || current.recorded) return
    change({ recording: true })
    try {
      for (let attempt = 0; attempt < 2 && !disposed; attempt++) {
        try {
          const result = await deps.record(evidence.id, sessionId, 2000)
          if (disposed) return
          const viewCount = Math.max(current.viewCount, result.viewCount)
          change({ viewCount, recorded: true })
          deps.onRecorded?.(viewCount)
          return
        } catch { /* Retry the same session once when the connection fails. */ }
      }
    } finally {
      if (!disposed) change({ recording: false })
    }
  }

  function syncCount(viewCount = 0): void {
    if (!disposed && viewCount > current.viewCount) change({ viewCount })
  }

  return { subscribe: state.subscribe, record, syncCount, dispose: () => { disposed = true } }
}
