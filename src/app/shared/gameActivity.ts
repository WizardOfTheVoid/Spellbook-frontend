export type GameActivitySnapshot = Readonly<{
  available: boolean
  isMoving: boolean
  isChatting: boolean
  timeSinceMovementMs: number
  timeSinceChattingMs: number | null
  chatCooldownRemainingMs: number
}>

export type DebugActivityApi = {
  onActivity: (callback: (activity: GameActivitySnapshot | null) => void) => () => void
}
