export type RuleDebugStatus = `Waiting` | `Ignored` | `Queued` | `Claimed` | `Executing` | `Executed` | `Failed` | `Expired` | `Cancelled` | `Superseded` | `Unknown` | `Paused` | `Disabled` | `Stopped` | `Cooldown` | `Mixed`

export type RuleEvaluation = {
  at: number
  revision: number
  status: `Waiting` | `Ignored` | `Queued` | `Cooldown`
  reason: string
  runIds: number[]
  cooldownUntil: number | null
}

export type RulesetDebugSnapshot = {
  gameServerId: number
  serverTime: number
  nextTickAt: number | null
  lastTickAt: number | null
  running: boolean
  evaluating: boolean
  paused: boolean
  error: string | null
  rosterReceivedAt: string | null
  rules: {
    id: number
    name: string
    profileName: string
    status: RuleDebugStatus
    reason: string
    evaluatedAt: number | null
    nextDueAt: number | null
    cooldownUntil: number | null
    outcomes: Partial<Record<RuleDebugStatus, number>>
    lastRun: { id: number, status: RuleDebugStatus, code: string | null, message: string | null, sentCommands: number | null } | null
  }[]
}

export function ruleRunStatus(status: string): RuleDebugStatus {
  const labels: Record<string, RuleDebugStatus> = { pending: `Queued`, claimed: `Claimed`, submitting: `Executing`, completed: `Executed`,
    failed: `Failed`, expired: `Expired`, cancelled: `Cancelled`, superseded: `Superseded`, unknown: `Unknown` }
  return labels[status] ?? `Unknown`
}
