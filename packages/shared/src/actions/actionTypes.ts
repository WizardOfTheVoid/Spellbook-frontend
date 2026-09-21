import type { TagTypeDefinition } from './tagTypeDefinitions.js'
import type { IncrementalBan } from './incrementalBan.js'

export type ActionCommandType = `server_message` | `admin_message` | `warn` | `kick` | `ban` | `incremental_ban` | `unban`
export type ActionPriority = `low` | `normal` | `high`
export type ActionOrigin = `local` | `request` | `rule` | `wanted`
export type ActionStatus = `pending` | `claimed` | `submitting` | `completed` | `failed` | `expired` | `superseded` | `cancelled` | `unknown`
export type ActionReference =
  | { kind: `profile`, profileId: number, actionKey: string }
  | { kind: `system`, key: `wanted.ban` | `wanted.unban` | `wanted.test` }
  | { kind: `system`, key: `server.message`, commandType: `server_message` | `admin_message`, message: string, username: string }
  | { kind: `system`, key: `player.unban`, actionId: number | null, removeOffense: boolean, profile?: { profileId: number, actionKey: string } }
export type ActionTarget = { type: `server` } | { type: `player`, playfabId: string }
export type ActionCommand = {
  commandType: ActionCommandType
  sortOrder: number
  delayMs: number
  durationHours?: number | null
  incrementalBan?: IncrementalBan | null
  message: string
  offenseType?: string | null
}
export type ActionRecipe = {
  label: string
  actionDomain: `player` | `server`
  delayMs: number
  isEnabled: boolean
  blockOnMissingVariables: boolean
  commands: ActionCommand[]
}
export type ActionContext = {
  tagDefinitions?: readonly TagTypeDefinition[]
  admin: string
  player?: { playfabId: string, name: string }
  serverName: string
  clanName?: string
  clanTag?: string
  offenses?: number
  variables?: { key: string, value: string }[]
}
export type PreparedCommand = {
  commandType: Exclude<ActionCommandType, `incremental_ban`>
  message: string
  delayMs: number
  playfabId?: string
  hours?: number
}
export type CommandSpan = {
  index: number
  offset: number
  count: number
  command: ActionCommand & { commandType: Exclude<ActionCommandType, `incremental_ban`> }
  message: string
}
export type PreparedAction = { commands: PreparedCommand[], spans: CommandSpan[], nativeCount: number }
export type ActionResult = {
  status: `completed` | `failed` | `expired` | `superseded` | `cancelled`
  sentCommands: number
  code?: string
  message?: string
}
export type ActionRequest = {
  requestKey: string
  gameServerId: number
  profileId: number
  actionKey: string
  target: ActionTarget
  expiresAt?: string
}
export type ActionRun = {
  id: number
  origin: ActionOrigin
  reference: ActionReference
  target: ActionTarget
  gameServerId: number
  teamId: number | null
  requesterId: number | null
  ruleId: number | null
  wantedSourceId: number | null
  parentRunId: number | null
  status: ActionStatus
  priority: ActionPriority
  mock: boolean
  expiresAt: string
  createdAt: string
  startedAt: string | null
  executorId: number | null
  cancelRequested: boolean
  coreActionId: string | null
  result: ActionResult | null
}
export type ActionClaim = { run: ActionRun, token: string, expiresAt: string }
export type ActionStart = {
  run: ActionRun
  recipe: ActionRecipe
  context: ActionContext
  coreActionId: string
  serverTime: string
  expiresAt: string
}
export type ActionPoll = {
  gameServerId: number
  active?: { runId: number, token: string }[]
}
export type UnbanActionRequest = {
  requestKey: string
  gameServerId: number
  playerId: number
  actionId?: number
  removeOffense?: boolean
  profile?: { profileId: number, actionKey: string }
  expiresAt?: string
}
export type MessageActionRequest = {
  requestKey: string
  gameServerId: number
  kind: `serversay` | `adminsay`
  message: string
}
export type ActionPollResult = { claims: ActionClaim[], cancel: number[], serverTime: string }
