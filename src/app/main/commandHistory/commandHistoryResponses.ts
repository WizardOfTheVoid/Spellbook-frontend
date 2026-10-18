import type { ConsoleSubmission } from '../../shared/commandHistory/commandHistory'
import type { CoreCallResult } from '../types'
import { ValueReader } from '../parsers/value-reader'

type SubmissionHistory = {
  streamId: string
  sequence: number
  oldestSequence: number
  eventsLost: boolean
  game: { processId: number, windowHandle: string } | null
  commands: ConsoleSubmission[]
}

export class IncompatibleCommandHistoryError extends Error {}
const record = ValueReader.isRecord
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0
const positive = (value: unknown): value is number => integer(value) && value > 0

function data(result: CoreCallResult): Record<string, unknown> {
  if (!result.ok || !record(result.data) || result.data.ok !== true || !record(result.data.data)) {
    throw new Error(result.error?.message ?? `Could not read Core command history.`)
  }
  return result.data.data
}

export function readInputHistory(result: CoreCallResult): string[] {
  const input = data(result)
  if (input.file !== `Input.ini` || !record(input.sections)) throw new Error(`Invalid Input.ini response.`)
  const section = Object.entries(input.sections).find(([key]) => key.toLowerCase() === `/script/tbl.tblconsole`)?.[1]
  const history = record(section) ? Object.entries(section).find(([key]) => key.toLowerCase() === `historybuffer`)?.[1] : null
  if (!Array.isArray(history) || !history.every(value => typeof value === `string`)) {
    throw new Error(`Input.ini has no complete console HistoryBuffer.`)
  }
  return [...history]
}

export function readSubmittedCommands(result: CoreCallResult, after: number): SubmissionHistory {
  if (result.status === 404) throw new IncompatibleCommandHistoryError(`Update Core to support command submission history.`)
  const value = data(result)
  const game = value.game ?? null
  const commands = value.commands
  if (typeof value.streamId !== `string` || !value.streamId || !integer(value.sequence) || !integer(value.oldestSequence) ||
    typeof value.eventsLost !== `boolean` || !Array.isArray(commands) || commands.length > 1024 ||
    (game !== null && (!record(game) || !positive(game.processId) || typeof game.windowHandle !== `string` || !/^0x[\da-f]+$/iu.test(game.windowHandle)))) {
    throw new Error(`Invalid Core submission history.`)
  }
  const oldest = value.oldestSequence
  if (value.sequence === 0 ? oldest !== 0 : oldest < 1 || oldest > value.sequence) throw new Error(`Invalid command stream bounds.`)
  const first = Math.max(after + 1, oldest)
  if (commands.length !== Math.max(0, value.sequence - first + 1)) throw new Error(`Core command history has a coverage gap.`)
  for (const [index, command] of commands.entries()) {
    if (!record(command) || command.sequence !== first + index || typeof command.command !== `string` ||
      typeof command.submittedAtUtc !== `string` || !Number.isFinite(Date.parse(command.submittedAtUtc)) ||
      typeof command.ageMs !== `number` || !Number.isFinite(command.ageMs) || command.ageMs < 0 ||
      typeof command.actionId !== `string` || !integer(command.commandIndex) || ![`user`, `system`].includes(command.author as string) ||
      !positive(command.appProcessId) || !positive(command.gameProcessId)) throw new Error(`Invalid command submission receipt.`)
  }
  return { streamId: value.streamId, sequence: value.sequence, oldestSequence: oldest,
    eventsLost: value.eventsLost || after > value.sequence || oldest > 0 && after < oldest - 1,
    game: game as SubmissionHistory[`game`], commands: commands as ConsoleSubmission[] }
}
