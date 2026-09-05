import type { AuditLogQuery, AuditLogRecord } from '$lib/core'
import { getAuditLogs, mergeAuditLogs } from '$lib/utils/auditLogsApi'

const pageSize = 50

export type AuditLogFilters = Readonly<{
  eventType?: string
  actorId?: string
  targetType?: string
  targetId?: string
  gameServerId?: string
  outcome?: string
  createdFrom?: string
  createdTo?: string
}>

export type AuditLogsState = Readonly<{
  logs: readonly AuditLogRecord[]
  nextBeforeId: number | null
  loading: boolean
  error: string | null
}>

export type AuditLogsOutcome = Readonly<{
  ok: boolean
  message?: string
}> | null

type AuditLogsDependencies = {
  list: typeof getAuditLogs
}

export class AuditLogsController {
  state: AuditLogsState = emptyState()

  private filters: AuditLogFilters = {}
  private generation = 0
  private userId: number | null = null
  private active = false
  private destroyed = false

  constructor(
    private readonly dependencies: AuditLogsDependencies = { list: getAuditLogs },
    private readonly onChange: (state: AuditLogsState) => void = () => undefined
  ) {}

  setContext(userId: number | null, active: boolean): void {
    if (this.userId === userId && this.active === active) return
    this.generation += 1
    this.userId = userId
    this.active = active && isPositiveId(userId)
    this.filters = {}
    this.setState(emptyState())
  }

  reset(filters: AuditLogFilters): Promise<AuditLogsOutcome> {
    if (!this.ready()) return Promise.resolve(null)
    const token = ++this.generation
    this.filters = { ...filters }
    this.setState({ ...emptyState(), loading: true })
    return this.load(token, undefined, true)
  }

  loadMore(): Promise<AuditLogsOutcome> {
    const beforeId = this.state.nextBeforeId
    if (!this.ready() || this.state.loading || beforeId === null) return Promise.resolve(null)
    const token = this.generation
    this.setState({ ...this.state, loading: true, error: null })
    return this.load(token, beforeId, false)
  }

  destroy(): void {
    if (this.destroyed) return
    this.generation += 1
    this.destroyed = true
    this.active = false
    this.userId = null
    this.setState(emptyState())
  }

  private async load(
    token: number,
    beforeId: number | undefined,
    replace: boolean
  ): Promise<AuditLogsOutcome> {
    try {
      const page = await this.dependencies.list(auditLogQuery(this.filters, beforeId))
      if (!this.isCurrent(token)) return null
      this.setState({
        logs: mergeAuditLogs(replace ? [] : this.state.logs, page.logs),
        nextBeforeId: page.nextBeforeId,
        loading: false,
        error: null
      })
      return { ok: true }
    } catch (error) {
      if (!this.isCurrent(token)) return null
      const message = error instanceof Error ? error.message : 'Audit log request failed.'
      this.setState({ ...this.state, loading: false, error: message })
      return { ok: false, message }
    }
  }

  private ready(): boolean {
    return !this.destroyed && this.active && isPositiveId(this.userId)
  }

  private isCurrent(token: number): boolean {
    return this.ready() && token === this.generation
  }

  private setState(state: AuditLogsState): void {
    this.state = state
    this.onChange(state)
  }
}

export function auditLogQuery(
  filters: AuditLogFilters,
  beforeId?: number
): AuditLogQuery {
  return compact({
    beforeId: beforeId === undefined ? undefined : positiveId(beforeId, 'cursor'),
    eventType: text(filters.eventType),
    actorId: numericFilter(filters.actorId, 'actor'),
    targetType: text(filters.targetType),
    targetId: text(filters.targetId),
    gameServerId: numericFilter(filters.gameServerId, 'server'),
    outcome: text(filters.outcome),
    createdFrom: utcBoundary(filters.createdFrom, false),
    createdTo: utcBoundary(filters.createdTo, true),
    limit: pageSize
  })
}

function emptyState(): AuditLogsState {
  return { logs: [], nextBeforeId: null, loading: false, error: null }
}

function compact(query: Record<string, unknown>): AuditLogQuery {
  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== undefined)
  ) as AuditLogQuery
}

function text(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}

function numericFilter(value: string | undefined, label: string): number | undefined {
  const trimmed = text(value)
  if (trimmed === undefined) return undefined
  if (!/^[1-9]\d*$/.test(trimmed)) throw new Error(`Invalid ${label} ID.`)
  return positiveId(Number(trimmed), label)
}

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid ${label} ID.`)
  return value
}

function utcBoundary(value: string | undefined, end: boolean): string | undefined {
  const trimmed = text(value)
  if (trimmed === undefined) return undefined
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (!match) throw new Error('Invalid audit date.')

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day) {
    throw new Error('Invalid audit date.')
  }
  if (end) date.setUTCHours(23, 59, 59, 999)
  return date.toISOString()
}

function isPositiveId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}
