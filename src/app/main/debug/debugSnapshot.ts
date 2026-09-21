import type { CoreDebugSnapshot } from '../../shared/debug'
import type { CoreCallResult } from '../types'
import { readActivity } from '../services/gameActivitySnapshot'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === `object` && !Array.isArray(value)
}

export function envelopeData(result: CoreCallResult): unknown {
  return isRecord(result.data) && `data` in result.data ? result.data.data : result.data
}

export function readDebugSettings(value: unknown): Record<string, number> {
  if (!isRecord(value) || Object.keys(value).length > 32 || !Object.values(value).every(item => integer(item) && item <= 2147483647)) throw new Error(`Invalid Core debug settings.`)
  return { ...value } as Record<string, number>
}

export function readDebugSnapshot(result: CoreCallResult): CoreDebugSnapshot {
  const data = envelopeData(result)
  if (!result.ok || (isRecord(result.data) && result.data.ok === false)) throw new Error(result.error?.message ?? `Core unavailable.`)
  if (!isRecord(data) || !integer(data.sequence) || !Array.isArray(data.events) || typeof data.eventsLost !== `boolean` || typeof data.armed !== `boolean` || !isRecord(data.status) || !isRecord(data.queue) || !isRecord(data.input) || !isRecord(data.execution) || !isRecord(data.windows) || !isRecord(data.settings)) throw new Error(`Invalid Core debug snapshot.`)
  const status = readActivity({ ok: true, status: 200, statusText: `OK`, data: { ok: true, data: data.status } }, 0)
  if (!status || !Array.isArray(data.queue.actions) || typeof data.queue.paused !== `boolean` || typeof data.execution.phase !== `string` || !isRecord(data.windows.game) || !isRecord(data.windows.app) || !Object.values(data.settings).every(integer)) throw new Error(`Invalid Core debug diagnostics.`)
  if (!data.events.every(event => isRecord(event) && integer(event.sequence) && event.sequence <= (data.sequence as number) && typeof event.kind === `string` && integer(event.timeMs) && typeof event.message === `string`)) throw new Error(`Invalid Core debug events.`)
  if (!data.queue.actions.every(action => isRecord(action) && typeof action.id === `string` && typeof action.key === `string` && [`user`, `system`].includes(action.author as string) && [`low`, `normal`, `high`].includes(action.priority as string) && integer(action.cursor) && integer(action.commandCount) && integer(action.remainingMs) && typeof action.state === `string` && Array.isArray(action.commands))) throw new Error(`Invalid Core debug queue.`)
  if (!numberArray(data.input.heldKeys) || !numberArray(data.input.heldButtons) || !integer(data.input.injectedKeyboardEvents) || !integer(data.input.injectedMouseEvents)) throw new Error(`Invalid Core debug input.`)
  return { ...data, status, events: data.events.filter(event => event.kind !== `physical_key` && event.kind !== `physical_button`) } as unknown as CoreDebugSnapshot
}

function integer(value: unknown): value is number { return typeof value === `number` && Number.isSafeInteger(value) && value >= 0 }
function numberArray(value: unknown): value is number[] { return Array.isArray(value) && value.every(integer) }
