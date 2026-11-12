import type { Endpoint, StreamCursor, TelemetryUpdate, Vec3 } from './telemetryTypes'

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === `object` && !Array.isArray(value)
export const isId = (value: unknown): value is string =>
  typeof value === `string` &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
export const isTime = (value: unknown): value is number =>
  typeof value === `number` && Number.isSafeInteger(value) && value >= 0
export const isPlayFabId = (value: unknown): value is string =>
  typeof value === `string` && /^[0-9a-f]{1,16}$/i.test(value)
export const isEndpoint = (value: unknown): value is Endpoint =>
  isRecord(value) &&
  typeof value.host === `string` &&
  /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value.host) &&
  value.host.split(`.`).every((part) => Number(part) <= 255) &&
  isTime(value.port) &&
  value.port > 0 &&
  value.port <= 65535
export const isVec3 = (value: unknown): value is Vec3 =>
  isRecord(value) &&
  [value.x, value.y, value.z].every((n) => typeof n === `number` && Number.isFinite(n))
export const isCursor = (value: unknown): value is StreamCursor =>
  isRecord(value) && isId(value.generation) && isTime(value.updateSequence)
export const isTelemetryUpdate = (value: unknown): value is TelemetryUpdate =>
  isRecord(value) &&
  value.protocolVersion === 1 &&
  isId(value.recordingId) &&
  isTime(value.revision) &&
  isCursor(value.cursor) &&
  isRecord(value.committedHead) &&
  isTime(value.committedHead.sequence) &&
  isTime(value.committedHead.elapsedUs) &&
  [`changed`, `resync`].includes(String(value.kind)) &&
  [`starting`, `recording`, `stopping`, `saved`, `interrupted`, `failed`].includes(
    String(value.state)
  )

export function requireValue(
  condition: unknown,
  message = `Invalid telemetry request`
): asserts condition {
  if (!condition) throw new Error(message)
}
