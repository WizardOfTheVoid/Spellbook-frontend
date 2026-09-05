export const dashboardActionTypes = [`ban`, `kick`, `warn`, `mute`, `unban`] as const
export type DashboardActionType = typeof dashboardActionTypes[number]

export const dashboardActionScopes = [`local`, `global`] as const
export type DashboardActionScope = typeof dashboardActionScopes[number]

export const dashboardOffenseTypes = [
  `hacker`, `ffa`, `verbal_abuse`, `griefing`, `exploiting`,
  `toxic_behavior`, `low_level`, `votekick_abuse`, `other`,
] as const
export type DashboardOffenseType = typeof dashboardOffenseTypes[number]

export type DashboardSeries = Readonly<{
  id: string
  label: string
  kind: `user` | `team` | `global-average`
  values: readonly number[]
}>

export type DashboardRecentAction = Readonly<{
  id: number
  playerId: number
  playerName: string | null
  actionType: DashboardActionType
  offenseType: DashboardOffenseType | null
  duration: number | null
  scope: DashboardActionScope
  expiresAt: string | null
  unbannedAt: string | null
  createdAt: string
}>

export type DashboardRecentActions = Readonly<{
  bans: readonly DashboardRecentAction[]
  kicks: readonly DashboardRecentAction[]
  unbans: readonly DashboardRecentAction[]
}>

export type DashboardSnapshot = Readonly<{
  generatedAt: string
  yourServers: Readonly<{
    online: number
    total: number
    players: number
  }>
  latestActions: Readonly<{
    total24Hours: number
    buckets: readonly number[]
  }>
  yourBans: Readonly<{
    local: number
    wantedActions: number
    total: number
  }>
  global: Readonly<{
    localBans: number
    wantedActions: number
    wantedServerApplications: number
    playerActions: number
    activeAdmins: number
    activeTeams: number
  }>
  timeline: Readonly<{
    bucketStarts: readonly string[]
    series: readonly DashboardSeries[]
  }>
  leaderboards: Readonly<{
    individuals: readonly Readonly<{
      userId: number
      name: string
      actions: number
      trendPercent: number | null
    }>[]
    teams: readonly Readonly<{
      teamId: number
      name: string
      actions: number
      trendPercent: number | null
    }>[]
  }>
  recentActions: DashboardRecentActions
}>
