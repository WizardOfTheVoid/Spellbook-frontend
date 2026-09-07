export type GameActivitySnapshot = Readonly<{
  available: boolean
  isMoving: boolean
  isChatting: boolean
  isAfk: boolean
  gameFocused: boolean
  overlayFocused: boolean
  timeSinceMovementMs: number
  timeSinceChattingMs: number | null
  chatCooldownRemainingMs: number
  lastCommand: Readonly<{ command: string, timeSinceMs: number }> | null
}>

export type DebugActivityApi = {
  onActivity: (callback: (activity: GameActivitySnapshot | null) => void) => () => void
}
