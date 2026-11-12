import type { NavigationSnapshot } from './navigationHistory'

export function editorBoundary(snapshot: NavigationSnapshot): string {
  const root = snapshot.app?.value as Record<string, unknown> | undefined
  const profile = snapshot.profileView?.value as { mode: string, tab?: string } | undefined
  const admin = snapshot.admin?.value as { view: string } | undefined
  const team = snapshot.teamDetail?.value as { selectedTeamId: number | null, teamView: string } | undefined
  const server = snapshot.serverDetail?.value as { editingServer?: { id: number } | null, selectedPlayer?: { playfabId: string } | null } | undefined
  return JSON.stringify(root && [root.activePage, root.selectedProfileId, root.selectedOwner,
    root.activePage === `profiles` ? [profile?.mode, profile?.tab === `rulesets`] : null,
    root.activePage === `admin` && admin?.view === `tag-types` ? `tag-types` : null,
    root.activePage === `teams` ? [team?.selectedTeamId, team?.teamView] : null,
    root.activePage === `servers` ? [server?.editingServer?.id, server?.selectedPlayer?.playfabId, snapshot.serverTab?.value] : null])
}
