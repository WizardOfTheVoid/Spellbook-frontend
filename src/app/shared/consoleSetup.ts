import type { ConsoleKeyCode } from './consoleKey'
import type { ConsoleLayoutSelection, KeyboardLayout, KeyboardLayoutId, VerifiedConsoleBinding } from './keyboardLayout'

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
  setupLoaded: boolean
  setupRequired: boolean
  recordRequired: boolean
  setupReason: null | `layoutMissing` | `keyUnverified` | `layoutUnavailable` | `coreUpgradeRequired` | `storageUnavailable`
  layoutCatalogStatus: `loading` | `ready` | `unavailable`
  layouts: readonly KeyboardLayout[]
  selectedLayout: ConsoleLayoutSelection | null
  lastVerifiedBinding: VerifiedConsoleBinding | null
  restorationFault: string | null
  legacySetup: boolean
}>

export type ConsoleSetupApi = {
  consoleSetupState(): Promise<ConsoleSetupState>
  checkConsoleEnabled(): Promise<boolean>
  enableConsole(): Promise<boolean>
  checkConsoleBind(retry?: boolean): Promise<boolean>
  recordConsoleKey(code: ConsoleKeyCode): Promise<boolean>
  setConsoleLayout(layoutId: KeyboardLayoutId): Promise<boolean>
  refreshKeyboardLayouts(): Promise<ConsoleSetupState>
  retryKeyboardLayoutRestore(): Promise<boolean>
  onConsoleSetupStateChanged(callback: (state: ConsoleSetupState) => void): () => void
}

export const uncheckedConsole: ConsoleCheck = { status: `unchecked`, message: `Not checked` }
export const consoleSetupIssue = `Check the in-game console and key in Settings.`

export function initialConsoleSetupState(consoleKey: ConsoleKeyCode = `NumpadSubtract`): ConsoleSetupState {
  return { consoleKey, enabled: uncheckedConsole, windowMode: uncheckedConsole, binding: uncheckedConsole, commandsBlocked: true, commandIssue: consoleSetupIssue, writing: false,
    setupLoaded: false, setupRequired: true, recordRequired: true, setupReason: `layoutMissing`, layoutCatalogStatus: `loading`,
    layouts: [], selectedLayout: null, lastVerifiedBinding: null, restorationFault: null, legacySetup: false }
}
