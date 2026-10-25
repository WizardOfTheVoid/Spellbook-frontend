import { setTimeout as delay } from 'node:timers/promises'
import type {
  Endpoint,
  RecordingJob,
  RecordingStatus,
  StreamCursor,
  TelemetryFrame,
  TelemetryUpdate,
  WorkerStatus
} from '../../shared/telemetry/telemetryTypes'
import {
  isCursor,
  isEndpoint,
  isId,
  isRecord,
  requireValue
} from '../../shared/telemetry/telemetryValidation'
import { noTelemetryAccess, requireTelemetryAccess, type TelemetryAccess } from './telemetryAccess'
import { WorkerConnectionError } from './telemetryClient'
import type { TelemetryClient } from './telemetryClient'
import type { TelemetryProcessController } from './telemetryProcessController'
import type { TelemetryNameCache } from './telemetryNameCache'
import { TelemetryReads } from './telemetryReads'
import { isTelemetryQuery, queryTelemetry } from './telemetryQueries'
import type { GameState } from '../../shared/gameState'
import { TelemetryCaptureLifecycle } from './telemetryCaptureLifecycle'

type ProcessController = Pick<TelemetryProcessController, `start` | `stop`>
export class TelemetryOrchestrator {
  private access: TelemetryAccess = noTelemetryAccess
  private epoch = 0
  private controller: ProcessController | null = null
  private streams = new Set<AbortController>()
  private activeId: string | null = null
  private activeEndpoint: Endpoint | null = null
  private naming = false
  private named = new Set<string>()
  private closing: Promise<void> = Promise.resolve()
  private reads = new TelemetryReads()
  private lifecycle = new TelemetryCaptureLifecycle()
  private captureNotice: string | null = null
  private lifecycleStop: Promise<string | null> | null = null
  private lifecycleStopEpoch = -1
  private notices = new Set<(message: string) => void>()
  constructor(
    private readonly createProcess: (userId: number) => ProcessController,
    private readonly names: TelemetryNameCache,
    private readonly pickFiles: () => Promise<{ files: string[]; manifest?: string } | null>
  ) {}

  async setAccess(next: TelemetryAccess): Promise<void> {
    if (this.access.userId === next.userId && this.access.allowed === next.allowed) return
    this.access = Object.freeze({ ...next })
    this.epoch++
    this.reads.clear()
    for (const stream of this.streams) stream.abort()
    this.streams.clear()
    this.names.clear()
    this.named.clear()
    const controller = this.controller
    const active = this.activeId
    this.controller = null
    this.activeId = null
    this.activeEndpoint = null
    this.captureNotice = null
    this.notices.clear()
    this.closing = this.close(controller, active)
    await this.closing
  }
  private async close(controller: ProcessController | null, active: string | null): Promise<void> {
    if (!controller) return
    try {
      if (active) await (await controller.start()).call(`/recordings/${active}/stop`, {}, `POST`, 8000)
    } catch {
    } finally {
      await controller.stop()
    }
  }
  private async connection(): Promise<{ client: TelemetryClient; epoch: number }> {
    const user = requireTelemetryAccess(this.access)
    const epoch = this.epoch
    await this.closing
    this.check(epoch)
    this.controller ??= this.createProcess(user)
    const client = await this.controller.start()
    this.check(epoch)
    return { client, epoch }
  }
  private check(epoch: number): void {
    requireTelemetryAccess(this.access)
    if (epoch !== this.epoch) throw new Error(`Telemetry account changed`)
  }
  async call(operation: string, input?: unknown): Promise<unknown> {
    requireTelemetryAccess(this.access)
    if (operation === `cancelReads`) {
      requireValue(isRecord(input))
      this.reads.cancel(input.workspaceId, input.throughRequestId)
      return
    }
    if (isTelemetryQuery(operation)) return this.query(operation, input)
    const { client, epoch } = await this.connection()
    const body = isRecord(input) ? input : {}
    const id = typeof input === `string` ? input : body.recordingId
    const recording = () => {
      requireValue(isId(id))
      return String(id)
    }
    let result: unknown
    try {
      switch (operation) {
        case `getStatus`:
          result = await client.call<WorkerStatus>(`/status`)
          this.check(epoch)
          this.activeId = (result as WorkerStatus).active?.id ?? null
          this.activeEndpoint = (result as WorkerStatus).active?.endpoint ?? null
          await this.enforceLifecycle()
          result = { ...(result as WorkerStatus), active: this.activeId ? (result as WorkerStatus).active : null,
            error: this.captureNotice ?? (result as WorkerStatus).error }
          break
        case `startRecording`:
          requireValue(isEndpoint(body.endpoint))
          this.lifecycle.begin()
          this.captureNotice = null
          if (this.lifecycle.reasonToStop(body.endpoint) === `serverChanged`)
            throw new Error(`Join the selected server or return to the main menu before recording this target.`)
          result = await client.call<RecordingStatus>(`/recordings`, {
            endpoint: { host: body.endpoint.host, port: body.endpoint.port }
          })
          this.check(epoch)
          this.activeId = (result as RecordingStatus).id
          this.activeEndpoint = (result as RecordingStatus).endpoint
          {
            const reason = await this.enforceLifecycle()
            if (reason) throw new Error(reason)
          }
          break
        case `stopRecording`:
          result = await client.call(`/recordings/${recording()}/stop`, {})
          this.check(epoch)
          if (this.activeId === id) {
            this.activeId = null
            this.activeEndpoint = null
          }
          break
        case `listRecordings`:
          result = await client.call(`/recordings`)
          break
        case `importRecording`: {
          requireValue(body.endpoint === undefined || isEndpoint(body.endpoint))
          const files = await this.pickFiles()
          this.check(epoch)
          if (!files) return null
          const capability = await client.call<{ capability: string }>(`/import-inputs`, {
            ...files,
            endpoint: body.endpoint
          })
          result = await client.call<RecordingJob>(`/imports`, capability)
          break
        }
        case `reprocessRecording`:
          result = await client.call(`/recordings/${recording()}/reprocess`, {})
          break
        case `getJob`:
        case `cancelJob`:
          requireValue(isId(input))
          result =
            operation === `getJob`
              ? await client.call(`/jobs/${input}`)
              : await client.call(`/jobs/${input}/cancel`, {})
          break
        default:
          throw new Error(`Unknown telemetry operation`)
      }
    } catch (error) {
      if (error instanceof WorkerConnectionError && epoch === this.epoch) {
        const controller = this.controller
        this.controller = null
        this.activeId = null
        await controller?.stop()
      }
      throw error
    }
    this.check(epoch)
    return result
  }
  cancelAllReads(): void {
    this.reads.clear()
  }
  private async query(operation: string, input: unknown): Promise<unknown> {
    const lease = this.reads.begin(isRecord(input) ? input : {})
    const epoch = this.epoch
    try {
      const { client } = await this.connection()
      lease.signal.throwIfAborted()
      const result = await queryTelemetry(client, operation, input, lease.signal)
      lease.signal.throwIfAborted()
      this.check(epoch)
      if (operation === `getFrame` || operation === `openRecording`)
        void this.enrich(client, result as TelemetryFrame, epoch)
      return result
    } catch (error) {
      if (error instanceof WorkerConnectionError && epoch === this.epoch) {
        const controller = this.controller
        this.controller = null
        this.activeId = null
        await controller?.stop()
      }
      throw error
    } finally {
      lease.finish()
    }
  }
  private async enrich(
    client: TelemetryClient,
    frame: TelemetryFrame,
    epoch: number
  ): Promise<void> {
    if (this.naming) return
    const ids = [
      ...new Set(
        [...frame.entities.filter((e) => !e.nameObservedAtUtc).map((e) => e.playFabId),
          ...(frame.players ?? []).filter(player => !player.name).map(player => player.playFabId)]
          .filter((id): id is string => !!id)
      )
    ].filter((id) => !this.named.has(`${frame.recordingId}:${id}`))
    if (!ids.length) return
    this.naming = true
    try {
      const names = await this.names.lookup(ids)
      this.check(epoch)
      if (names.length) await client.call(`/recordings/${frame.recordingId}/names`, names)
      this.check(epoch)
      for (const id of ids) this.named.add(`${frame.recordingId}:${id}`)
    } catch {
      /* Enrichment is optional label metadata. */
    } finally {
      this.naming = false
    }
  }
  subscribe(
    input: unknown,
    changed: (update: TelemetryUpdate) => void,
    failed: (error: string) => void
  ): () => void {
    requireTelemetryAccess(this.access)
    requireValue(
      isRecord(input) &&
        isId(input.recordingId) &&
        (input.cursor === undefined || isCursor(input.cursor))
    )
    const id = input.recordingId
    let cursor = input.cursor as StreamCursor | undefined
    const epoch = this.epoch
    const abort = new AbortController()
    this.streams.add(abort)
    this.notices.add(failed)
    void (async () => {
      let backoff = 250
      while (!abort.signal.aborted) {
        try {
          const { client } = await this.connection()
          for await (const update of client.updates(id, cursor, abort.signal)) {
            this.check(epoch)
            if (abort.signal.aborted) break
            if (update.recordingId !== id) throw new Error(`Wrong recording stream`)
            cursor = update.cursor
            changed(update)
            backoff = 250
          }
        } catch (error) {
          if (abort.signal.aborted || epoch !== this.epoch) break
          if (error instanceof WorkerConnectionError) {
            const controller = this.controller
            this.controller = null
            this.activeId = null
            await controller?.stop()
          }
          failed(error instanceof Error ? error.message : `Telemetry stream disconnected`)
        }
        try {
          await delay(backoff, undefined, { signal: abort.signal })
        } catch {
          break
        }
        backoff = Math.min(backoff * 2, 5000)
      }
    })()
    return () => {
      abort.abort()
      this.streams.delete(abort)
      this.notices.delete(failed)
    }
  }
  async observeGameState(state: GameState, address: string | null): Promise<void> {
    this.lifecycle.observe(state, address)
    await this.enforceLifecycle()
  }
  private async enforceLifecycle(): Promise<string | null> {
    if (this.lifecycleStop && this.lifecycleStopEpoch === this.epoch) return this.lifecycleStop
    const reason = this.activeEndpoint ? this.lifecycle.reasonToStop(this.activeEndpoint) : null
    if (!reason || !this.activeId || !this.access.allowed) return null
    const epoch = this.epoch
    const id = this.activeId
    const message = reason === `serverChanged`
      ? `Capture stopped because the connected server differs from the selected target.`
      : `Capture stopped because Chivalry exited.`
    this.lifecycleStopEpoch = epoch
    const stopping = (async () => {
      try {
        await this.call(`stopRecording`, id)
        if (epoch !== this.epoch) return null
        this.captureNotice = message
        for (const notice of this.notices) notice(message)
        return message
      } catch (error) {
        if (epoch === this.epoch) {
          const failure = `Could not stop capture: ${error instanceof Error ? error.message : `worker unavailable`}`
          this.captureNotice = failure
          for (const notice of this.notices) notice(failure)
          return failure
        }
        return null
      } finally {
        if (this.lifecycleStopEpoch === epoch) this.lifecycleStop = null
      }
    })()
    this.lifecycleStop = stopping
    return this.lifecycleStop
  }
  async sourceChanged(address?: string): Promise<void> {
    if (
      address &&
      this.activeEndpoint &&
      address === `${this.activeEndpoint.host}:${this.activeEndpoint.port}`
    )
      return
    if (this.activeId && this.access.allowed)
      await this.call(`stopRecording`, this.activeId).catch(() => undefined)
  }
  async dispose(): Promise<void> {
    await this.setAccess(noTelemetryAccess)
  }
}
