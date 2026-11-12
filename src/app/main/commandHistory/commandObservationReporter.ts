import { randomUUID } from 'node:crypto'
import type { CommandObservationInput, CommandObservationOrigin, CommandObservationResult } from '@spellbook/shared/commandObservations'
import type { CommandReportingState } from '../../shared/commandHistory/commandHistory'
import type { CommandObservationFrame } from './commandHistoryService'

type Entry = { rowId: number, payload: CommandObservationInput, origin: CommandObservationOrigin,
  sent: CommandObservationOrigin | null, frozen: boolean, disabled: boolean, status: CommandReportingState[`rows`][string] }
type Dependencies = {
  subscribe(listener: (frame: CommandObservationFrame) => void): () => void
  post(input: CommandObservationInput, signal: AbortSignal): Promise<CommandObservationResult>
  status(state: CommandReportingState): void
  context?: () => string
}
const ranks = { external: 0, unknown: 1, spellbook: 2 }
const reportable = (command: string) => command.trim().length > 0 && command.length <= 512
const followingContext = (commands: readonly string[]) => commands.length <= 50 && commands.every(reportable) ? [...commands] : undefined

export class CommandObservationReporter {
  private userId: number | null = null
  private unsubscribe: (() => void) | null = null
  private readonly entries = new Map<string, Entry>()
  private context = ``
  private generation = 0
  private revision = 0
  private blockedRevision = -1
  private controller: AbortController | null = null
  private uploading = false
  private evicted = 0
  private overflow = new Set<string>()
  private error = ``

  constructor(private readonly dependencies: Dependencies) {}

  setUser(userId: number | null): void {
    if (this.userId === userId) return
    this.userId = userId
    this.reset()
  }

  start(): void {
    this.unsubscribe ??= this.dependencies.subscribe(frame => this.observe(frame))
  }

  stop(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.reset()
  }

  private reset(): void {
    this.generation++
    this.controller?.abort()
    this.entries.clear()
    this.context = ``
    this.error = ``
    this.evicted = 0
    this.overflow.clear()
    this.blockedRevision = -1
    this.publish()
  }

  private observe(frame: CommandObservationFrame): void {
    if (this.userId === null) return
    if (frame.context !== this.context) { this.reset(); this.context = frame.context }
    this.revision++
    const rows = frame.rows.slice(-50)
    const retained = new Set(rows.map(item => item.key))
    const overflow = frame.rows.slice(0, Math.max(0, frame.rows.length - 50))
    this.evicted += overflow.filter(item => item.row.origin === `external` && item.binding
      && !this.overflow.has(item.key) && !this.entries.has(item.key)).length
    this.overflow = new Set(overflow.map(item => item.key))
    for (const [key, entry] of this.entries) if (!retained.has(key)) {
      if (entry.sent !== entry.origin) this.evicted++
      this.entries.delete(key)
    }
    for (const item of rows) {
      const { row, binding } = item
      let entry = this.entries.get(item.key)
      if (!entry && row.origin === `external` && row.observedAtUtc !== null && binding) {
        const disabled = !reportable(row.command)
        entry = { rowId: row.id, payload: { id: randomUUID(), clientId: binding.clientId, command: row.command,
          observedAtUtc: new Date(row.observedAtUtc).toISOString(), binding: { gameServerId: binding.gameServerId, generation: binding.generation },
          origin: `external`, followingCommands: followingContext(item.followingCommands) }, origin: `external`,
          sent: disabled ? `external` : null, frozen: disabled, disabled,
          status: { status: disabled ? `unreportable` : `pending`, playerActionId: null,
            ...(disabled ? { reason: `Command exceeds the reporting limit or is empty.` } : {}) } }
        this.entries.set(item.key, entry)
      }
      const origin = row.origin === `pending` ? `unknown` : row.origin
      if (entry && ranks[origin] > ranks[entry.origin]) entry.origin = origin
      if (entry?.disabled) entry.sent = entry.origin
      if (entry && !entry.frozen) entry.payload = { ...entry.payload, followingCommands: followingContext(item.followingCommands) }
    }
    this.publish()
    void this.deliver()
  }

  private async deliver(): Promise<void> {
    if (this.uploading || this.blockedRevision === this.revision || this.userId === null) return
    if (this.dependencies.context && this.dependencies.context() !== this.context) { this.reset(); return }
    const entry = [...this.entries.values()].find(item => !item.disabled && item.sent !== item.origin)
    if (!entry) return
    this.uploading = true
    const generation = this.generation
    const controller = new AbortController()
    this.controller = controller
    const origin = entry.origin
    entry.frozen = true
    try {
      const result = await this.dependencies.post({ ...entry.payload, origin }, AbortSignal.any([controller.signal, AbortSignal.timeout(3000)]))
      if (generation !== this.generation || controller.signal.aborted) return
      entry.sent = origin
      entry.status = { status: result.status === `duplicate` ? result.playerActionId !== null ? `recorded`
        : entry.status.status === `recorded` || entry.status.status === `retained` ? entry.status.status : `duplicate` : result.status,
        playerActionId: result.playerActionId }
      this.error = ``
    } catch {
      if (generation === this.generation && !controller.signal.aborted) {
        entry.status = { ...entry.status, status: `failed` }
        this.error = `Observation upload failed; retrying on the next history poll.`
        this.blockedRevision = this.revision
      }
    } finally {
      this.uploading = false
      if (this.controller === controller) this.controller = null
      this.publish()
      if (this.unsubscribe && this.userId !== null) void this.deliver()
    }
  }

  private publish(): void {
    this.dependencies.status({ pending: [...this.entries.values()].filter(item => item.sent !== item.origin).length,
      evicted: this.evicted, error: this.error,
      rows: Object.fromEntries([...this.entries.values()].map(item => [String(item.rowId), item.status])) })
  }
}
