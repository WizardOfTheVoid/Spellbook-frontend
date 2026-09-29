import { normalizeString } from '../normalizeString.js'
import { findMissingTemplateVariables } from './actionTemplates.js'
import { contextualMessageKeys } from './tagTypeDefinitions.js'
import { isMessageCommand, messageSource, renderActionMessage } from './actionMessage.js'
export { applyServerMessagePrefix } from './actionMessage.js'
import type { ActionContext, ActionRecipe, ActionTarget, PreparedAction, PreparedCommand } from './actionTypes.js'

export const unbanSubmissionCount = 4

export function prepareAction(recipe: ActionRecipe, target: ActionTarget, context: ActionContext): PreparedAction {
  if (!recipe.isEnabled) throw new RangeError(`Action is disabled.`)
  if (recipe.actionDomain !== target.type) throw new RangeError(`Action domain does not match target.`)
  if (target.type === `player` && (!/^[A-Za-z0-9_-]{4,128}$/u.test(target.playfabId) || context.player?.playfabId !== target.playfabId)) {
    throw new RangeError(`Action requires matching player context.`)
  }
  if (!recipe.commands.length) throw new RangeError(`At least one command is required.`)
  const variables = context.variables ?? []
  const missing = findMissingTemplateVariables(recipe.commands.map(command => command.message), variables, contextualMessageKeys)
  if (recipe.blockOnMissingVariables && missing.length) throw new RangeError(`${context.serverName} does not have ${missing.map(key => `[${key}]`).join(`, `)}. ${recipe.label} was blocked.`)
  let offset = 0
  const commands: PreparedCommand[] = []
  const spans = [...recipe.commands].sort((a, b) => a.sortOrder - b.sortOrder).map((original, index) => {
    if (original.commandType === `incremental_ban`) throw new RangeError(`Incremental bans must be resolved using current ban history before execution.`)
    const command = original.commandType === `ban` && original.offenseType === `hacker`
      ? { ...original, commandType: original.commandType, durationHours: 999999 } : { ...original, commandType: original.commandType }
    if (target.type === `server` && !isMessageCommand(command.commandType)) throw new RangeError(`Player commands require a player target.`)
    const hours = command.durationHours ?? 1
    const message = validateActionText(renderActionMessage(command, context, messageSource(recipe.commands, original)), command.commandType === `unban`)
    const delayMs = recipe.delayMs + command.delayMs
    if (!Number.isInteger(recipe.delayMs) || recipe.delayMs < 0 || !Number.isInteger(command.delayMs) || command.delayMs < 0 || delayMs > 2147483647) throw new RangeError(`Invalid command delay.`)
    const prepared: PreparedCommand = { commandType: command.commandType, message, delayMs }
    if ([`ban`, `kick`, `unban`].includes(command.commandType) && target.type === `player`) prepared.playfabId = target.playfabId
    if (command.commandType === `ban`) {
      if (!Number.isInteger(hours) || hours < 1 || hours > 999999) throw new RangeError(`Ban hours must be between 1 and 999999.`)
      prepared.hours = hours
    }
    commands.push(prepared)
    const count = command.commandType === `unban` ? unbanSubmissionCount : 1
    const span = { index, offset, count, command, message }
    offset += count
    return span
  })
  return { commands, spans, nativeCount: offset }
}

export function validateActionText(value: string, allowEmpty = false): string {
  const text = normalizeString(`game`, value)
  if (/[\r\n\0]/u.test(text)) throw new RangeError(`Message cannot contain CR, LF, or NUL.`)
  if (!allowEmpty && !text.trim()) throw new RangeError(`Message is required.`)
  if (text.includes(`"`)) throw new RangeError(`Message cannot contain double quotes.`)
  if (text.length > 180) throw new RangeError(`Message must be 180 characters or fewer.`)
  return text
}
