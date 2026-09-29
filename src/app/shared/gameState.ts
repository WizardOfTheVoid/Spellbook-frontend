export type GameState = Readonly<{
  version: number
  available: boolean
  running: boolean
  focused: boolean
  map: string | null
  playerCount: number | null
  connected: boolean
}>

export const initialGameState: GameState = Object.freeze({
  version: 0, available: false, running: false, focused: false, map: null, playerCount: null, connected: false
})

export const isGameRunning = (state: GameState): boolean => state.available && state.running
export const isGameFocused = (state: GameState): boolean => isGameRunning(state) && state.focused
export const isMainMenu = (state: GameState): boolean => isGameRunning(state) && isMainMenuObservation(state.map, state.playerCount)
export const isInGameServer = (state: GameState): boolean => isGameRunning(state) && !isMainMenu(state) && state.connected

export function isMainMenuObservation(map: string | null | undefined, playerCount: number | null): boolean {
  return map?.trim().toLowerCase() === `hastings` && playerCount === 1
}

export function createGameChecks(read: () => GameState) {
  return {
    isGameRunning: () => isGameRunning(read()),
    isGameFocused: () => isGameFocused(read()),
    isMainMenu: () => isMainMenu(read()),
    isInGameServer: () => isInGameServer(read())
  }
}

export type GameStateApi = {
  gameState(): Promise<GameState>
  refreshGameState(): Promise<GameState>
  onGameStateChanged(callback: (state: GameState) => void): () => void
}
