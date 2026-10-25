import { writable } from 'svelte/store'

export function createTeamMenuState(selectionRevision = 0) {
  const level = writable<`main` | `team`>(`main`)
  let contentTeamId: number | null = null
  return {
    subscribe: level.subscribe,
    openTeam: () => level.set(`team`),
    back: () => level.set(`main`),
    reset: () => level.set(`main`),
    syncContent(teamId: number | null, menuTeamId: number | null) {
      const previous = contentTeamId
      contentTeamId = teamId
      if (previous === null || previous === teamId || teamId !== null && teamId === menuTeamId) return false
      level.set(`main`)
      return true
    },
    syncSelection(revision: number, available: boolean) {
      if (revision === selectionRevision) return false
      selectionRevision = revision
      if (revision <= 0 || !available) return false
      level.set(`team`)
      return true
    }
  }
}
