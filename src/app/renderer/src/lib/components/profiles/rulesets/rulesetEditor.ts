import type { Ruleset, RulesetRule } from '@spellbook/shared/rulesets/rulesetTypes'

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
