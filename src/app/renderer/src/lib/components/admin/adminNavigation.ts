import type { TickAction } from '$lib/core'
import type { Tone } from '$lib/types/tone'

export type AdminRootView =
  | 'definitions'
  | 'actions'
  | 'users'
  | 'teams'
  | 'discord'
  | 'audit-logs'
  | 'integration-tests'
  | 'notification-tests'
  | `ux-ui`
  | 'tick-actions'
  | 'health'

export type AdminView = 'tag-types' | 'root' | 'user' | 'team' | 'discord-queue' | 'components' | 'grid' | AdminRootView

export type AdminRootTile = {
  view: AdminRootView
  title: string
  subtitle: string
  icon: string
  iconTone?: Tone
}

const rootTiles: AdminRootTile[] = [
  { view: `definitions`, title: `Definitions`, subtitle: `Manage shared tag types and wording`, icon: `fa-tags` },
  { view: `actions`, title: `Actions`, subtitle: `Inspect and test actions, rules and Wanted`, icon: `fa-bolt` },
  { view: 'users', title: 'Users', subtitle: 'View and manage user accounts', icon: 'fa-users', iconTone: 'accent' },
  { view: 'teams', title: 'Teams', subtitle: 'View every team and manage its members', icon: 'fa-people-group', iconTone: 'accent' },
  { view: `discord`, title: `Discord`, subtitle: `Broadcast updates and message connected Discord servers`, icon: `fa-bullhorn`, iconTone: `accent` },
  { view: 'audit-logs', title: 'Audit Logs', subtitle: 'Inspect historical admin activity', icon: 'fa-rectangle-list' },
  { view: 'integration-tests', title: 'Integration tests', subtitle: 'Run isolated Core integration probes', icon: 'fa-flask' },
  { view: `notification-tests`, title: `Notifications`, subtitle: `Send custom notifications and test your inbox`, icon: `fa-bell` },
  { view: `ux-ui`, title: `UX & UI`, subtitle: `Browse UI references and preview experiences`, icon: `fa-wand-magic-sparkles` },
  { view: 'tick-actions', title: 'Tick Actions', subtitle: 'Monitor and control scheduled data jobs', icon: 'fa-clock-rotate-left' },
  { view: 'health', title: 'Health', subtitle: 'Inspect application and service health', icon: 'fa-heart-pulse' }
]

export function adminRootTiles(): AdminRootTile[] {
  return rootTiles
}

type TickActionBackState = {
  view: 'root' | 'tick-actions'
  selectedAction: TickAction | null
}

export function adminBack(state: TickActionBackState): TickActionBackState {
  return state.selectedAction
    ? { view: 'tick-actions', selectedAction: null }
    : { view: 'root', selectedAction: null }
}
