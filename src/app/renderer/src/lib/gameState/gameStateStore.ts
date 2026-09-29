import { writable } from 'svelte/store'
import { getCoreApi } from '$lib/core'
import { createGameChecks, initialGameState, type GameState, type GameStateApi } from '../../../../shared/gameState'

export function createGameStateStore(api: () => GameStateApi) {
  let current = initialGameState
  const state = writable(current)
  let active = false
  let session = 0
  let unsubscribe = () => {}

  function update(next: GameState) {
    current = next
    state.set(next)
  }

  async function read(refresh: boolean): Promise<void> {
    if (!active) return
    const requestSession = session
    const version = current.version
    try {
      const next = await (refresh ? api().refreshGameState() : api().gameState())
      if (active && requestSession === session && next.version >= current.version) update(next)
    } catch {
      if (active && requestSession === session && current.version === version) update({ ...current, available: false })
    }
  }

  function sync(next: boolean): void {
    if (active === next) return
    active = next
    session++
    unsubscribe()
    unsubscribe = () => {}
    if (!active) {
      update(initialGameState)
      return
    }
    const currentSession = session
    try {
      unsubscribe = api().onGameStateChanged(next => {
        if (active && session === currentSession && next.version >= current.version) update(next)
      })
      void read(false)
    } catch { update({ ...current, available: false }) }
  }

  return { subscribe: state.subscribe, ...createGameChecks(() => current), sync,
    refresh: () => read(true), destroy: () => sync(false) }
}

export const gameState = createGameStateStore(getCoreApi)
export const { isGameRunning, isGameFocused, isMainMenu, isInGameServer } = gameState
