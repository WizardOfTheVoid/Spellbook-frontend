import { messageFactValues } from './messageFacts.js'
import { normalizeString } from '../normalizeString.js'
import { resolveTemplate } from './actionTemplates.js'
import { definedMessageValues } from './tagTypeDefinitions.js'
import type { ActionCommand, ActionContext } from './actionTypes.js'

export function isMessageCommand(type: string): type is `server_message` | `admin_message` {
  return type === `server_message` || type === `admin_message`
}

export function messageSource(commands: readonly ActionCommand[], selected: ActionCommand): ActionCommand | undefined {
  let source: ActionCommand | undefined
  for (const command of [...commands].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (!isMessageCommand(command.commandType)) source = command
    if (command === selected) return source
  }
  return undefined
}

export function renderActionMessage(command: ActionCommand, context: ActionContext, source: ActionCommand | undefined = isMessageCommand(command.commandType) ? undefined : command): string {
  const duration = source?.commandType === `ban` && source.offenseType === `hacker` ? 999999 : source?.durationHours
  const values = definedMessageValues({
    ...messageFactValues(context),
    user: context.player?.name ?? ``, duration: duration === 999999 ? `MAX` : String(duration ?? ``),
    admin: context.admin, playfab: context.player?.playfabId ?? ``, offenses: String(context.offenses ?? 0),
    offense_type: source?.offenseType ?? ``, action_type: source?.commandType ?? ``,
    server_name: context.serverName, clan_name: context.clanName ?? ``, clan_tag: context.clanTag ?? ``
  }, context.tagDefinitions)
  const message = resolveTemplate(command.message, values, context.variables)
  return normalizeString(`game`, applyServerMessagePrefix(message, command.commandType === `admin_message` ? `admin` : `server`, context.variables ?? []))
}

export function applyServerMessagePrefix(message: string, kind: `admin` | `server`, variables: readonly { key: string, value: string }[]): string {
  const prefix = variables.find(variable => variable.key === `${kind}say_prefix`)?.value.trimEnd() ?? ``
  return prefix ? `${prefix} ${message}` : message
}
