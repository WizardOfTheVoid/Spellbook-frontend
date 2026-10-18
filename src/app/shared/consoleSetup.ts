import type { ConsoleKeyCode } from './consoleKey'

export type ConsoleCheck = Readonly<{
  status: `unchecked` | `checking` | `passed` | `failed` | `unavailable`
  message: string
}>

export type ConsoleSetupState = Readonly<{
  consoleKey: ConsoleKeyCode
  enabled: ConsoleCheck
  windowMode: ConsoleCheck
  binding: ConsoleCheck
  commandsBlocked: boolean
  commandIssue: string | null
  writing: boolean
}>

export type ConsoleSetupApi = {
  consoleSetupState(): Promise<ConsoleSetupState>
  checkConsoleEnabled(): Promise<boolean>
  enableConsole(): Promise<boolean>
  checkConsoleBind(retry?: boolean): Promise<boolean>
  onConsoleSetupStateChanged(callback: (state: ConsoleSetupState) => void): () => void
}

export const uncheckedConsole: ConsoleCheck = { status: `unchecked`, message: `Not checked` }
export const consoleSetupIssue = `Check the in-game console and key in Settings.`
export const consoleBindingIssue = `In-game console key is incorrect. Check Settings.`

export function initialConsoleSetupState(consoleKey: ConsoleKeyCode = `NumpadSubtract`): ConsoleSetupState {
  return { consoleKey, enabled: uncheckedConsole, windowMode: uncheckedConsole, binding: uncheckedConsole, commandsBlocked: true, commandIssue: consoleSetupIssue, writing: false }
}
