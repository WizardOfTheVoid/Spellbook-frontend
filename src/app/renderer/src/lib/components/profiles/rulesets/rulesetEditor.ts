import type { RuleDefinition, Ruleset, RulesetRule } from '@spellbook/shared/rulesets/rulesetTypes'
import type { ServerProfileAction } from '$lib/core'

export function ruleRunScope(rule: RulesetRule, actions: ServerProfileAction[]): ServerProfileAction[`actionDomain`] | null {
  return actions.find(action => action.actionKey === rule.actionKey)?.actionDomain ?? null
}

export function actionKeyForScope(key: string, scope: ServerProfileAction[`actionDomain`], actions: ServerProfileAction[]): string {
  return actions.find(action => action.actionKey === key)?.actionDomain === scope ? key : ``
}

export function ruleActionWarning(rule: RulesetRule, action: ServerProfileAction | undefined): { perPlayer: boolean, broadcastCount: number } | null {
  if (action?.actionDomain !== `player`) return null
  const perPlayer = rule.condition.mode === `each`
  const broadcastCount = action.commands.filter(command => command.commandType === `server_message` || command.commandType === `admin_message`).length
  return perPlayer || broadcastCount ? { perPlayer, broadcastCount } : null
}

export function ruleHasSelectableAction(rule: RulesetRule, actions: ServerProfileAction[], definitions: RuleDefinition[]): boolean {
  const domain = ruleRunScope(rule, actions)
  if (domain === null) return false
  const condition = rule.condition
  return condition.mode === `each` || definitions.find(item => item.key === condition.definition)?.domain === domain
}

export function applyRulesetDraft(ruleset: Ruleset, draft: RulesetRule | null, index: number): Ruleset {
  if (!draft) return ruleset
  const rules = [...ruleset.rules]
  if (index === -1) rules.push(draft)
  else rules[index] = draft
  return { ...ruleset, rules }
}

export async function saveRulesetDraft(ruleset: Ruleset, draft: RulesetRule | null, index: number,
  persist: (value: Ruleset) => Promise<Ruleset>): Promise<Ruleset> {
  const next = applyRulesetDraft(ruleset, draft, index)
  return persist({ ...next, rules: next.rules.map(rule => ({ ...rule, priority: `normal` })) })
}
