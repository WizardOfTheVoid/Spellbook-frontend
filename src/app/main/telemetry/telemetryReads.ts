import { isTime, requireValue } from '../../shared/telemetry/telemetryValidation'

type Cohort = { requestId: number; recordingId: unknown; abort: AbortController }

export class TelemetryReads {
  private cohorts = new Map<string, Cohort>()
  private legacy = new Set<AbortController>()

  begin(input: Record<string, unknown>) {
    if (input.workspaceId === undefined) {
      requireValue(input.requestId === undefined || isTime(input.requestId))
      const abort = new AbortController()
      this.legacy.add(abort)
      return { signal: abort.signal, finish: () => { this.legacy.delete(abort) } }
    }
    requireValue([`live`, `replay`].includes(String(input.workspaceId)) && isTime(input.requestId))
    const workspaceId = String(input.workspaceId)
    let cohort = this.cohorts.get(workspaceId)
    if (cohort && input.requestId < cohort.requestId)
      throw new DOMException(`Telemetry read superseded`, `AbortError`)
    if (!cohort || input.requestId > cohort.requestId) {
      cohort?.abort.abort()
      cohort = { requestId: input.requestId, recordingId: input.recordingId, abort: new AbortController() }
      this.cohorts.set(workspaceId, cohort)
    }
    cohort.abort.signal.throwIfAborted()
    requireValue(cohort.recordingId === input.recordingId, `Telemetry read changed recording`)
    return { signal: cohort.abort.signal, finish: () => {} }
  }

  cancel(workspaceId: unknown, throughRequestId: unknown) {
    requireValue([`live`, `replay`].includes(String(workspaceId)) && isTime(throughRequestId))
    const key = String(workspaceId)
    const current = this.cohorts.get(key)
    if (current && current.requestId > throughRequestId) return
    current?.abort.abort()
    const abort = new AbortController()
    abort.abort()
    this.cohorts.set(key, { requestId: throughRequestId, recordingId: undefined, abort })
  }

  clear() {
    for (const cohort of this.cohorts.values()) cohort.abort.abort()
    for (const abort of this.legacy) abort.abort()
    this.cohorts.clear()
    this.legacy.clear()
  }
}
