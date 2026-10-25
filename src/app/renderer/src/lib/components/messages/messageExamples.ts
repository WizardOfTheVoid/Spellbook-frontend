import type { ActionCommand, ActionContext } from '@spellbook/shared/actions/actionTypes'
import { messageSource, renderActionMessage } from '@spellbook/shared/actions/actionMessage'
import { messageTemplatePattern } from '@spellbook/shared/actions/actionTemplates'

export function messagePreviewCount(template: string, resolved: string): string {
  const estimated = !template.matchAll(messageTemplatePattern).next().done
  return `${estimated ? `~` : ``}${resolved.length}/180`
}

export function renderMessagePreview(command: ActionCommand, context: ActionContext, source?: ActionCommand): string {
  const reason = [`ban`, `incremental_ban`, `kick`].includes(command.commandType)
  return renderActionMessage(command, reason ? {
    ...context,
    variables: context.variables?.map(variable => [`adminsay_prefix`, `serversay_prefix`].includes(variable.key)
      ? { ...variable, value: `` } : variable)
  } : context, source)
}

export function messageExampleSource(commands: readonly ActionCommand[], selected: ActionCommand): ActionCommand | undefined {
  const source = [...commands].sort((left, right) => left.sortOrder - right.sortOrder)
    .find(command => command.commandType === `ban` || command.commandType === `incremental_ban` || command.commandType === `kick`)
    ?? messageSource(commands, selected)
  return source?.commandType === `incremental_ban` ? { ...source, commandType: `ban`,
    durationHours: source.incrementalBan?.stages.find(stage => stage.banCount === 1)?.durationHours ?? 24 } : source
}
