import type { RulesetDebugSnapshot } from '@spellbook/shared/rulesets/ruleDiagnostics'

type Rule = RulesetDebugSnapshot[`rules`][number]
type LastRun = NonNullable<Rule[`lastRun`]>

const cancellationReasons: Record<string, string> = {
  ACTION_CANCELLED: `Client or Core cancelled execution`,
  CONTEXT_CHANGED: `The active server or action worker changed`,
  GAME_SESSION_CHANGED: `The game session changed`,
  CORE_STOPPED: `The Core action worker stopped`,
  DUPLICATE_ACTIVE_BAN: `Another ban task took precedence`,
  DUPLICATE_BAN_COMMAND: `A matching ban is already active`
}

export function ruleRunDetails(run: LastRun): string {
  let reason = run.message ?? ``
  if (run.status === `Cancelled` && (!reason || reason.trim().toLowerCase() === `action cancelled.`)) {
    reason = cancellationReasons[run.code ?? ``] ?? (run.code ? `Cancellation reported` : `Cancelled before execution; no reason recorded`)
  }
  const parts = [reason]
  if (run.code) parts.push(run.code)
  if (run.status === `Cancelled` && run.sentCommands !== null) parts.push(`${run.sentCommands} command${run.sentCommands === 1 ? `` : `s`} sent`)
  return parts.filter(Boolean).join(` · `)
}

export function visibleRulePreview(rules: Rule[], limit = 3): Rule[] {
  const cancelled = rules.filter(rule => rule.status === `Cancelled` || rule.lastRun?.status === `Cancelled`)
  return [...cancelled, ...rules.filter(rule => !cancelled.includes(rule))].slice(0, limit)
}
