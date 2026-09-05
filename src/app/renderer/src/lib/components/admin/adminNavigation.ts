import type { TickAction } from '$lib/core'
import type { Tone } from '$lib/types/tone'

export type AdminRootView =
  | 'users'
  | 'teams'
  | 'audit-logs'
  | 'integration-tests'
  | 'notification-tests'
  | 'tick-actions'
  | 'health'
  | 'dev-grid'
  | 'dev-ui'

export type AdminView = 'root' | 'user' | 'team' | AdminRootView

export type AdminRootTile = {
  view: AdminRootView
  title: string
  subtitle: string
  icon: string
  iconTone?: Tone
}

const rootTiles: AdminRootTile[] = [
  { view: 'users', title: 'Users', subtitle: 'View and manage user accounts', icon: 'fa-users', iconTone: 'accent' },
  { view: 'teams', title: 'Teams', subtitle: 'View every team and manage its members', icon: 'fa-people-group', iconTone: 'accent' },
  { view: 'audit-logs', title: 'Audit Logs', subtitle: 'Inspect historical admin activity', icon: 'fa-rectangle-list' },
  { view: 'integration-tests', title: 'Integration tests', subtitle: 'Run isolated Core integration probes', icon: 'fa-flask' },
  { view: 'notification-tests', title: 'Notification tests', subtitle: 'Create server-owned inbox fixtures', icon: 'fa-bell' },
  { view: 'tick-actions', title: 'Tick Actions', subtitle: 'Monitor and control scheduled data jobs', icon: 'fa-clock-rotate-left' },
  { view: 'health', title: 'Health', subtitle: 'Inspect application and service health', icon: 'fa-heart-pulse' }
]

const developmentTiles: AdminRootTile[] = [
  { view: 'dev-grid', title: 'GRID', subtitle: 'Grid system reference and examples', icon: 'fa-table-cells' },
  { view: 'dev-ui', title: 'UI components', subtitle: 'Shared component gallery', icon: 'fa-layer-group' }
]

export function adminRootTiles(development: boolean): AdminRootTile[] {
  return development ? [...rootTiles, ...developmentTiles] : rootTiles
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
