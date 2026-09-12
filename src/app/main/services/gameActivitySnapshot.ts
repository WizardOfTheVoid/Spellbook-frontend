import { ValueReader } from '../parsers/value-reader'
import type { CoreCallResult, JsonRecord } from '../types'
import type { CoreStatusSnapshot, GameActivitySnapshot } from '../../shared/gameActivity'

export function readActivity(result: CoreCallResult, minimumMovementIdleMs: number): GameActivitySnapshot | null {
  if (!result.ok || !ValueReader.isRecord(result.data) || result.data.ok !== true) return null
  const raw = ValueReader.getEnvelopeData(result)
  if (!raw) return null
  const queue = withNullFields(raw.queue, [`id`, `author`, `priority`, `remainingMs`, `reason`, `lastResult`])
  if (ValueReader.isRecord(queue)) queue.lastResult = withNullFields(queue.lastResult, [`errorCode`])
  const data = {
    ...raw,
    focus: withNullFields(raw.focus, [`reason`]),
    input: withNullFields(raw.input, [`timeSinceChattingMs`]),
    execution: withNullFields(raw.execution, [`reason`]),
    queue,
    lastCommand: raw.lastCommand ?? null,
    recentCommands: raw.recentCommands ?? (raw.lastCommand ? [raw.lastCommand] : [])
  }
  if (!isCoreStatus(data)) return null
  const { input, focus } = data
  const inGame = data.runtime.gameRunning && focus.gameFocused
  return {
    ...data,
    available: input.available,
    isMoving: inGame && (input.keyboardActive || input.mouseActive),
    isChatting: input.isChatting,
    isAfk: inGame && input.available &&
      !input.keyboardActive && !input.mouseActive && input.idleMs >= minimumMovementIdleMs,
    gameFocused: focus.gameFocused,
    overlayFocused: focus.appFocused,
    timeSinceMovementMs: input.idleMs,
    timeSinceChattingMs: input.timeSinceChattingMs,
    chatCooldownRemainingMs: input.chatCooldownRemainingMs
  }
}

function isCoreStatus(value: unknown): value is CoreStatusSnapshot {
  if (!ValueReader.isRecord(value)) return false
  const { runtime, focus, input, execution, queue, lastCommand, recentCommands } = value
  if (!ValueReader.isRecord(runtime) || !ValueReader.isRecord(focus) || !ValueReader.isRecord(input) ||
    !ValueReader.isRecord(execution) || !ValueReader.isRecord(queue)) return false
  if (!hasBooleans(runtime, [`enabled`, `gameRunning`, `appRunning`]) ||
    !hasBooleans(focus, [`gameFocused`, `appFocused`, `gameReady`]) ||
    !hasBooleans(input, [`available`, `keyboardActive`, `mouseActive`, `isChatting`]) ||
    !hasBooleans(execution, [`canExecuteCommand`])) return false
  if (![input.idleMs, input.chatCooldownRemainingMs, queue.pendingActions, queue.cursor, queue.commandCount]
    .every(isNonnegativeNumber) || !isNullableNumber(input.timeSinceChattingMs) ||
    !isNullableNumber(queue.remainingMs)) return false
  if (![focus.reason, execution.reason, queue.id, queue.reason].every(isNullableString) ||
    (focus.limitation !== undefined && !isNullableString(focus.limitation)) ||
    ![`unknown`, `clear`, `active`].includes(focus.overlayState as string) ||
    ![`running`, `paused`, `idle`].includes(queue.state as string) ||
    (queue.author !== null && ![`user`, `system`].includes(queue.author as string)) ||
    (queue.priority !== null && ![`low`, `normal`, `high`].includes(queue.priority as string))) return false
  const lastResult = queue.lastResult
  if (lastResult !== null && (!ValueReader.isRecord(lastResult) || typeof lastResult.id !== `string` ||
    typeof lastResult.status !== `string` || !isNonnegativeNumber(lastResult.sentCommands) ||
    !isNullableString(lastResult.errorCode))) return false
  return (lastCommand === null || isCommandSnapshot(lastCommand)) &&
    Array.isArray(recentCommands) && recentCommands.length <= 3 && recentCommands.every(isCommandSnapshot)
}

const isCommandSnapshot = (value: unknown): boolean => ValueReader.isRecord(value) &&
  typeof value.command === `string` && isNonnegativeNumber(value.timeSinceMs)

const hasBooleans = (source: JsonRecord, keys: string[]): boolean => keys.every(key => typeof source[key] === `boolean`)
const isNonnegativeNumber = (value: unknown): boolean => typeof value === `number` && Number.isFinite(value) && value >= 0
const isNullableNumber = (value: unknown): boolean => value === null || isNonnegativeNumber(value)
const isNullableString = (value: unknown): boolean => value === null || typeof value === `string`

function withNullFields(value: unknown, fields: string[]): unknown {
  if (!ValueReader.isRecord(value)) return value
  return { ...value, ...Object.fromEntries(fields.map(field => [field, value[field] ?? null])) }
}
