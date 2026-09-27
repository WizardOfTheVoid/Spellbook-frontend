import type { NavigationSnapshot } from './navigationHistory'

export function editorBoundary(snapshot: NavigationSnapshot): string {
  const root = snapshot.app?.value as Record<string, unknown> | undefined
  const profile = snapshot.profileView?.value as { mode: string, tab?: string } | undefined
  const admin = snapshot.admin?.value as { view: string } | undefined
  return JSON.stringify(root && [root.activePage, root.selectedProfileId, root.selectedOwner,
    root.activePage === `profiles` ? [profile?.mode, profile?.tab === `rulesets`] : null,
    root.activePage === `admin` && admin?.view === `tag-types` ? `tag-types` : null])
}
