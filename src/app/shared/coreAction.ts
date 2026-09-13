import type { ConsoleKeyCode } from './consoleKey'

export const unbanSubmissionCount = 4

export type CoreActionAuthor = `user` | `system`
export type CoreActionPriority = `low` | `normal` | `high`
export type CoreAppTarget = { processId: number, windowHandle: string }
export type CoreConsoleCommand = {
  type: `console`
  command: string
  consoleKey: ConsoleKeyCode
  delayMs?: number
  expectClipboard?: boolean
  restoreClipboard?: boolean
}
export type CoreKeysCommand = {
  type: `keys`
  presses: { virtualKey: number, durationMs: number }[]
  minimumIdleMs?: number
  delayMs?: number
}
export type CoreCommand = CoreConsoleCommand | CoreKeysCommand
export type CoreActionOptions = { id?: string, author: CoreActionAuthor, priority: CoreActionPriority }
export type CoreAction = {
  id: string
  key: string
  author: CoreActionAuthor
  priority: CoreActionPriority
  app: CoreAppTarget
  commands: CoreCommand[]
}
