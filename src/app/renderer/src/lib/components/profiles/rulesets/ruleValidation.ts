import type { RuleDefinition, RulesetRule } from '@spellbook/shared/rulesets/rulesetTypes'
import type { ProfileActionDraft } from '../profileDraft'
import { ruleHasSelectableAction } from './rulesetEditor'
import { integerError } from '../profileValidation'

export function ruleErrors(rule: RulesetRule, actions: Pick<ProfileActionDraft, `actionKey` | `actionDomain`>[], definitions: RuleDefinition[],
  zone: string | null, dateError = ``): Record<string, string | null> {
  const errors: Record<string, string | null> = {}
  if (!rule.name.trim()) errors.name = `Name is required.`
  else if (rule.name.length > 255) errors.name = `Use at most 255 characters.`
  if (rule.description.length > 2000) errors.description = `Use at most 2000 characters.`
  const condition = rule.condition
  if (condition.mode === `each`) {
    errors.amount = integerError(condition.amount, 1, 10080)
    if (![`minute`, `hour`].includes(condition.unit)) errors.unit = `Select an interval unit.`
  } else {
    const definition = definitions.find(item => item.key === condition.definition)
    if (!definition) errors.definition = `Select a condition.`
    else {
      if (!definition.operators.includes(condition.operator)) errors.operator = `Select a comparison.`
      const value = condition.value
      switch (definition.valueType) {
        case `number`:
          if (typeof value !== `number` || !Number.isFinite(value) || value < 0) errors.value = `Enter a nonnegative number.`
          break
        case `text`:
          if (typeof value !== `string` || !/^[A-Za-z0-9_-]{4,128}$/u.test(value)) errors.value = `Enter a valid PlayFab ID.`
          break
        case `date`:
          if (typeof value !== `string` || !/Z$/u.test(value) || !Number.isFinite(Date.parse(value))) errors.value = `Choose a date and time.`
          break
        case `time`:
          if (typeof value !== `string` || !/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value)) errors.value = `Choose a time.`
      }
      if (definition.valueType === `date` || definition.valueType === `time`) {
        errors.value = dateError || errors.value || (!zone ? `Load your timezone before editing dates and times.` : null)
      }
    }
  }
  if (!ruleHasSelectableAction(rule, actions, definitions)) errors.actionKey = `Choose an action that matches this rule.`
  return errors
}
