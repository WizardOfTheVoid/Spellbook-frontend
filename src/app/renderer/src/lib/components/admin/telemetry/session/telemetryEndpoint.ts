import type { Endpoint } from '../../../../../../../shared/telemetry/telemetryTypes'
import { isEndpoint } from '../../../../../../../shared/telemetry/telemetryValidation'

export function parseTelemetryEndpoint(value: string | null | undefined): Endpoint | null {
  const match = value?.trim().match(/^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/)
  if (!match) return null
  const endpoint = { host: match[1], port: Number(match[2]) }
  return isEndpoint(endpoint) ? endpoint : null
}
