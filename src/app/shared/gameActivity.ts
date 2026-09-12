import type { CoreActionAuthor, CoreActionPriority } from './coreAction'

export type CoreStatusSnapshot = Readonly<{
  runtime: Readonly<{ enabled: boolean, gameRunning: boolean, appRunning: boolean }>
  focus: Readonly<{
    gameFocused: boolean
    appFocused: boolean
    gameReady: boolean
    reason: string | null
    overlayState: `unknown` | `clear` | `active`
    limitation?: string | null
  }>
  input: Readonly<{
    available: boolean
    keyboardActive: boolean
    mouseActive: boolean
    idleMs: number
    isChatting: boolean
    timeSinceChattingMs: number | null
    chatCooldownRemainingMs: number
  }>
  execution: Readonly<{ canExecuteCommand: boolean, reason: string | null }>
  queue: Readonly<{
    state: `running` | `paused` | `idle`
    pendingActions: number
    id: string | null
    author: CoreActionAuthor | null
    priority: CoreActionPriority | null
    cursor: number
    commandCount: number
    remainingMs: number | null
    reason: string | null
    lastResult: Readonly<{ id: string, status: string, sentCommands: number, errorCode: string | null }> | null
  }>
  lastCommand: Readonly<{ command: string, timeSinceMs: number }> | null
  recentCommands: ReadonlyArray<Readonly<{ command: string, timeSinceMs: number }>>
}>

export type GameActivitySnapshot = CoreStatusSnapshot & Readonly<{
  available: boolean
  isMoving: boolean
  isChatting: boolean
  isAfk: boolean
  gameFocused: boolean
  overlayFocused: boolean
  timeSinceMovementMs: number
  timeSinceChattingMs: number | null
  chatCooldownRemainingMs: number
}>

export type DebugActivityApi = {
  onActivity: (callback: (activity: GameActivitySnapshot | null) => void) => () => void
}
