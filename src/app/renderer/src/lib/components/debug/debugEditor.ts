import type { CoreCommand } from '../../../../../shared/coreAction'
import type { DebugPreset } from '../../../../../shared/debug'
import { validateDebugPreset } from '../../../../../shared/debugPresets'

export function importPreset(text: string, current: DebugPreset): DebugPreset {
  const value = JSON.parse(text)
  if (!value || typeof value !== `object` || !Array.isArray(value.commands)) {
    throw new Error(`Import a preset or Action containing commands.`)
  }
  const result = structuredClone(current)
  for (const key of [`label`, `instruction`, `author`, `priority`, `commands`, `repeat`, `intervalMs`, `startDelayMs`, `identity`] as const) {
    if (Object.hasOwn(value, key)) Object.assign(result, { [key]: value[key] })
  }
  return validateDebugPreset(result)
}

export function moveCommand(commands: CoreCommand[], index: number, offset: number): CoreCommand[] {
  const target = index + offset
  if (index < 0 || index >= commands.length || target < 0 || target >= commands.length) return commands
  const result = [...commands]
  const [command] = result.splice(index, 1)
  result.splice(target, 0, command)
  return result
}

export function commandSummary(command: CoreCommand): string {
  const content = command.type === `console` ? command.command : command.presses.map(press => `VK ${press.virtualKey} · ${press.durationMs}ms`).join(`, `)
  return `${command.type}: ${content}${command.delayMs ? ` · delay ${command.delayMs}ms` : ``}`
}

export const debugJson = (value: unknown): string => JSON.stringify(value, null, 2) ?? `—`
export const debugSeconds = (value: number | null | undefined): string => value === null || value === undefined ? `—` : value > 0 && value < 1000 ? `${Math.round(value)}ms` : `${Math.floor(value / 1000)}s`
export const debugTime = (value: number): string => new Date(value).toLocaleTimeString([], { hour12: false })
