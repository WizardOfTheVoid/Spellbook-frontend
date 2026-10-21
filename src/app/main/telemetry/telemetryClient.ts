import {
  maxTelemetryBytes,
  type StreamCursor,
  type TelemetryUpdate
} from '../../shared/telemetry/telemetryTypes'
import { isTelemetryUpdate } from '../../shared/telemetry/telemetryValidation'

export async function* readUpdates(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<TelemetryUpdate> {
  const reader = body.getReader()
  const decoder = new TextDecoder(`utf-8`, { fatal: true })
  let pending = ``
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      pending += decoder.decode(value, { stream: true })
      let newline: number
      while ((newline = pending.indexOf(`\n`)) !== -1) {
        if (Buffer.byteLength(pending.slice(0, newline)) > maxTelemetryBytes)
          throw new Error(`Telemetry update too large`)
        const update: unknown = JSON.parse(pending.slice(0, newline))
        if (!isTelemetryUpdate(update)) throw new Error(`Invalid telemetry protocol update`)
        pending = pending.slice(newline + 1)
        yield update
      }
      if (Buffer.byteLength(pending) > maxTelemetryBytes)
        throw new Error(`Telemetry update too large`)
    }
    pending += decoder.decode()
    if (pending.length) throw new Error(`Truncated telemetry update`)
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

export class WorkerConnectionError extends Error {}
export class TelemetryRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = `TelemetryRequestError`
  }
}
export class TelemetryClient {
  constructor(
    private readonly address: string,
    private readonly token: string,
    private readonly lifetime: AbortSignal,
    private readonly request: typeof fetch = fetch
  ) {}

  private async response(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await this.request(`${this.address}/v1${path}`, {
      ...init,
      redirect: `error`,
      signal: init.signal ? AbortSignal.any([this.lifetime, init.signal]) : this.lifetime,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(init.body ? { 'Content-Type': `application/json` } : {})
      }
    })
    if (response.status === 401)
      throw new WorkerConnectionError(`Telemetry worker authentication failed`)
    return response
  }
  async call<T>(
    path: string,
    input?: unknown,
    method = input === undefined ? `GET` : `POST`,
    timeoutMs = 120_000,
    signal?: AbortSignal
  ): Promise<T> {
    const response = await this.response(path, {
      method,
      body: input === undefined ? undefined : JSON.stringify(input),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs)
    })
    const reader = response.body?.getReader()
    let length = 0
    const chunks: Uint8Array[] = []
    if (reader)
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          length += value.byteLength
          if (length > maxTelemetryBytes) throw new Error(`Telemetry response exceeds size limit`)
          chunks.push(value)
        }
      } finally {
        await reader.cancel().catch(() => undefined)
        reader.releaseLock()
      }
    const json = length ? JSON.parse(Buffer.concat(chunks).toString(`utf8`)) : null
    if (!response.ok)
      throw new TelemetryRequestError(
        typeof json?.detail === `string`
          ? json.detail
          : `Telemetry request failed (${response.status})`,
        response.status
      )
    return json as T
  }
  async *updates(
    id: string,
    cursor: StreamCursor | undefined,
    signal: AbortSignal
  ): AsyncGenerator<TelemetryUpdate> {
    const query = new URLSearchParams(
      cursor ? { generation: cursor.generation, afterSequence: String(cursor.updateSequence) } : {}
    )
    const response = await this.response(`/recordings/${id}/updates?${query}`, { signal })
    if (!response.ok || !response.body) throw new Error(`Telemetry stream unavailable`)
    yield* readUpdates(response.body)
  }
}
