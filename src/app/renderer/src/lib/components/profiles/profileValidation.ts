import { validateIncrementalBan, type IncrementalBan } from '@spellbook/shared/actions/incrementalBan'
import { playerOffenseTypes } from '@spellbook/shared/playerBans'
import type { ProfileDraft } from './profileDraft'

export type ProfileFieldError = { field: string, message: string, actionIndex?: number, commandIndex?: number }

export function integerError(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): string | null {
  if (value === `` || value === null || value === undefined) return `This field is required.`
  if (typeof value !== `number` || !Number.isSafeInteger(value)) return `Enter a whole number.`
  if (value < minimum) return `Use ${minimum} or higher.`
  return value > maximum ? `Use ${maximum} or less.` : null
}

export function incrementalBanFieldErrors(config: IncrementalBan): Record<string, string | null> {
  const errors: Record<string, string | null> = {}
  if (![null, 30, 90].includes(config.windowDays)) errors.windowDays = `Select a counting window.`
  if (config.offenseTypes !== null && (!config.offenseTypes.length || config.offenseTypes.some(type => !playerOffenseTypes.some(offense => offense === type)))) {
    errors.offenseTypes = `Select at least one offense type.`
  }
  config.stages.forEach((stage, index) => {
    errors[`${index}.banCount`] = integerError(stage.banCount, 1)
      ?? (config.stages.some((other, otherIndex) => otherIndex !== index && other.banCount === stage.banCount)
        || !config.stages.some(other => other.banCount === 1) ? `Use unique ban numbers starting at 1.` : null)
    errors[`${index}.durationHours`] = integerError(stage.durationHours, 1, 999999)
  })
  return errors
}

export function profileErrors(profile: ProfileDraft): ProfileFieldError[] {
  const errors: ProfileFieldError[] = []
  const add = (field: string, message: string | null, actionIndex?: number, commandIndex?: number) => {
    if (message) errors.push({ field, message, actionIndex, commandIndex })
  }
  add(`name`, !profile.profile.name.trim() ? `Name is required.` : profile.profile.name.trim().length > 255 ? `Use at most 255 characters.` : null)
  profile.actions.forEach((action, actionIndex) => {
    add(`label`, !action.label.trim() ? `Name is required.` : action.label.trim().length > 255 ? `Use at most 255 characters.` : null, actionIndex)
    add(`actionDomain`, ![`player`, `server`].includes(action.actionDomain) ? `Select an action domain.` : null, actionIndex)
    add(`delayMs`, integerError(action.delayMs), actionIndex)
    action.commands.forEach((command, commandIndex) => {
      const types = action.actionDomain === `server` ? [`server_message`, `admin_message`]
        : [`server_message`, `admin_message`, `warn`, `kick`, `ban`, `incremental_ban`, `unban`]
      add(`commandType`, !types.includes(command.commandType) ? `Select an action type for this domain.` : null, actionIndex, commandIndex)
      add(`delayMs`, integerError(command.delayMs), actionIndex, commandIndex)
      add(`message`, !command.message.trim() ? `Message is required.` : command.message.trim().length > 180 ? `Use at most 180 characters.` : null, actionIndex, commandIndex)
      if ([`warn`, `kick`, `ban`, `incremental_ban`].includes(command.commandType)) {
        add(`offenseType`, !playerOffenseTypes.some(type => type === command.offenseType) ? `Select an offense type.` : null, actionIndex, commandIndex)
      }
      if (command.commandType === `ban`) add(`durationHours`, integerError(command.durationHours, 1, 999999), actionIndex, commandIndex)
      if (command.commandType === `incremental_ban`) {
        try { validateIncrementalBan(command.incrementalBan) }
        catch (error) { add(`incrementalBan`, error instanceof Error ? error.message : `Invalid ban stages.`, actionIndex, commandIndex) }
      }
    })
  })
  return errors
}
