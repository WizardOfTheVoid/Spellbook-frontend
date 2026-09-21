import type { ActionPriority, ActionTarget } from '../actions/actionTypes.js'

export type RuleDefinitionKey = `Player.rank` | `Player.lastLogin` | `Player.accountCreated` | `Player.playTime` | `Player.offenses` | `Player.playfabid` | `Server.totalPlayers` | `Server.AdminsOnline` | `System.Time`
export type RuleOperator = `=` | `!=` | `<` | `<=` | `>` | `>=`
export type RuleDefinition = {
  key: RuleDefinitionKey
  label: string
  domain: `player` | `server`
  valueType: `number` | `date` | `text` | `time`
  operators: readonly RuleOperator[]
  unit?: string
}
export type RuleCondition =
  | { mode: `if`, definition: RuleDefinitionKey, operator: RuleOperator, value: string | number }
  | { mode: `each`, amount: number, unit: `minute` | `hour` }
export type RulesetRule = {
  id: number
  rulesetId: number
  name: string
  description: string
  enabled: boolean
  actionKey: string
  priority: ActionPriority
  freshnessSeconds: number
  condition: RuleCondition
  revision: number
}
export type Ruleset = { id: number, profileId: number, enabled: boolean, paused: boolean, rules: RulesetRule[] }
export type RulePreview = { targets: ActionTarget[], unavailable: { playfabId?: string, reason: string }[] }
export type RuleRoster = {
  gameServerId: number
  userId: number
  clientId: string
  sessionId: string
  sequence: number
  receivedAt: string
  players: { playfabId: string, name: string }[]
}
