import { writable } from 'svelte/store'
import type { TeamRecord } from '$lib/core'
import { canReadTeam } from '$lib/teams/currentTeamStore'
import type { TeamNavigationTarget, TeamPanelTarget } from '$lib/teams/teamNavigation'

type TeamMenuEntry = { target: `profiles` | TeamPanelTarget, adminOnly?: boolean }

export function canAccessTeamMenuEntry(
  entry: TeamMenuEntry, team: Pick<TeamRecord, `permissions`> | null, isSuperadmin: boolean
): boolean {
  return !entry.adminOnly || team !== null && (isSuperadmin || team.permissions.includes(`admin`))
}

export async function openTeamMenuEntry(
  entry: TeamMenuEntry,
  team: TeamRecord | null,
  isSuperadmin: boolean,
  open: (target: TeamNavigationTarget) => Promise<boolean>
): Promise<boolean> {
  if (!team || !canReadTeam(team) || !canAccessTeamMenuEntry(entry, team, isSuperadmin)) return false
  return open(entry.target === `profiles`
    ? { page: `profiles`, teamId: team.id }
    : { page: `teams`, teamId: team.id, teamView: entry.target })
}

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
