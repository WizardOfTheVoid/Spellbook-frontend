import type { ProfileOwner } from '$lib/core'
import type { ActivePage } from '$lib/types/ui'

export type TeamView = `members` | `guidelines` | `settings` | `requests`
export type TeamPanelTarget = TeamView | `servers`
export type TeamPanelLocation = { teamId: number | null, teamView: TeamPanelTarget }
export type TeamNavigationTarget = { page: `profiles`, teamId: number }
  | { page: `teams`, teamId: number | null, teamView?: TeamPanelTarget }

export function getTeamContentId(page: ActivePage, owner: ProfileOwner | null, location: TeamPanelLocation, pending: { teamId: number | null } | null): number | null {
  if (page === `profiles`) return owner?.type === `team` ? owner.id : null
  if (page === `teams`) return pending ? pending.teamId : location.teamId
  return null
}

export async function visitTeamTarget(target: TeamNavigationTarget, ports: {
  canLeave(): Promise<boolean>
  isCurrent(): boolean
  visit(action: () => Promise<boolean>): Promise<boolean>
  open(target: TeamNavigationTarget): Promise<boolean>
}): Promise<boolean> {
  const captured = { ...target }
  return ports.visit(async () => {
    if (!ports.isCurrent() || !await ports.canLeave() || !ports.isCurrent()) return false
    return ports.open(captured)
  })
}
