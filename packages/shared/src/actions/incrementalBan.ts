import { playerOffenseTypes } from '../playerBans.js'
import type { ActionCommand } from './actionTypes.js'

export type IncrementalBan = {
  windowDays: 30 | 90 | null
  offenseTypes: string[] | null
  stages: { banCount: number, durationHours: number }[]
}

export function validateIncrementalBan(value: unknown): IncrementalBan {
  const config = value as IncrementalBan | null
  if (!config || ![null, 30, 90].includes(config.windowDays)) throw new RangeError(`Select 30 days, 90 days, or all time.`)
  if (config.offenseTypes !== null && (!Array.isArray(config.offenseTypes) || !config.offenseTypes.length
    || config.offenseTypes.some(type => !playerOffenseTypes.some(offense => offense === type)))) {
    throw new RangeError(`Select at least one valid offense type, or all offenses.`)
  }
  if (!Array.isArray(config.stages) || !config.stages.length) throw new RangeError(`Add at least one ban stage.`)
  const stages = config.stages.map(stage => {
    if (!stage || !Number.isSafeInteger(stage.banCount) || stage.banCount < 1
      || !Number.isInteger(stage.durationHours) || stage.durationHours < 1 || stage.durationHours > 999999) {
      throw new RangeError(`Stages require a positive whole ban number and 1–999999 hours.`)
    }
    return { banCount: stage.banCount, durationHours: stage.durationHours }
  }).sort((a, b) => a.banCount - b.banCount)
  if (stages[0].banCount !== 1 || new Set(stages.map(stage => stage.banCount)).size !== stages.length) {
    throw new RangeError(`Ban stages must start at 1 and have unique ban numbers.`)
  }
  return { windowDays: config.windowDays, offenseTypes: config.offenseTypes === null ? null : [...new Set(config.offenseTypes)].sort(), stages }
}

export function resolveIncrementalBan(command: ActionCommand, priorBans: number): ActionCommand {
  if (command.commandType !== `incremental_ban`) return command
  if (!Number.isSafeInteger(priorBans) || priorBans < 0) throw new RangeError(`Ban history count is unavailable.`)
  const config = validateIncrementalBan(command.incrementalBan)
  const stage = config.stages.filter(stage => stage.banCount <= priorBans + 1).at(-1)!
  const { incrementalBan, ...resolved } = command
  return { ...resolved, commandType: `ban`, durationHours: command.offenseType === `hacker` ? 999999 : stage.durationHours }
}
