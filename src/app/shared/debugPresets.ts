import { isConsoleKeyCode, type ConsoleKeyCode } from './consoleKey'
import type { CoreCommand } from './coreAction'
import type { DebugLayout, DebugPreset } from './debug'

export function createDebugPresets(consoleKey: ConsoleKeyCode | null = null): DebugPreset[] {
  const listPlayers: CoreCommand = { type: `console`, command: `ListPlayers`, consoleKey: consoleKey ?? `NumpadSubtract`, expectClipboard: true, restoreClipboard: true }
  const serverSay = (intervalMs: number): CoreCommand => ({ type: `console`, command: `ServerSay "Dev test - ${intervalMs}ms - #[N]"`, consoleKey: consoleKey ?? `NumpadSubtract`, restoreClipboard: true })
  const preset = (slot: number, label: string, instruction: string, commands: CoreCommand[], options: Partial<DebugPreset> = {}): DebugPreset => ({
    slot, label, instruction, author: `user`, priority: `normal`, commands,
    repeat: 1, intervalMs: 250, startDelayMs: 0, identity: `distinct`, ...options
  })
  return [
    preset(1, `Once: ListPlayers - Low priority`, `Release the trigger and observe low-priority readiness and the clipboard result.`,
      [{ ...listPlayers }], { author: `system`, priority: `low` }),
    preset(2, `Loop: ServerSay - 250ms`, `Press 2 to start or stop. Each message increments [N]; restarting resets the count.`,
      [serverSay(250)], { repeat: `infinite` }),
    preset(3, `Loop: ListPlayers - 150ms`, `Press 3 to start or stop ListPlayers every 150ms.`,
      [{ ...listPlayers }], { author: `system`, priority: `low`, repeat: `infinite`, intervalMs: 150 }),
    preset(4, `Loop: ListPlayers + ServerSay - 200ms`, `Press 4 to start or stop ListPlayers followed by ServerSay every 200ms.`,
      [{ ...listPlayers }, serverSay(200)], { repeat: `infinite`, intervalMs: 200 })
  ]
}

export function createDebugLayout(): DebugLayout {
  const panel = (x: number, y: number) => ({ visible: true, x, y, scale: 1, opacity: 0.9 })
  return { tests: panel(0.01, 0.04), queue: panel(0.01, 0.96), state: panel(0.99, 0.04), events: panel(0.99, 0.96), ruleset: panel(0.5, 0.04) }
}

export function validateDebugPreset(value: unknown): DebugPreset {
  const input = record(value, `Preset`)
  const slot = integer(input.slot, 1, 4, `Slot`)
  const label = text(input.label, 120, `Label`)
  const instruction = text(input.instruction, 1000, `Instruction`, true)
  if (input.author !== `user` && input.author !== `system`) throw new RangeError(`Author must be user or system.`)
  if (input.priority !== `low` && input.priority !== `normal` && input.priority !== `high`) throw new RangeError(`Priority must be low, normal, or high.`)
  if (input.identity !== `matching` && input.identity !== `distinct`) throw new RangeError(`Identity must be matching or distinct.`)
  const commands = list(input.commands, `Commands`).map(validateCommand)
  return { slot, label, instruction, author: input.author, priority: input.priority, identity: input.identity, commands,
    repeat: input.repeat === `infinite` ? `infinite` : integer(input.repeat, 1, 100, `Repeat`), intervalMs: integer(input.intervalMs, 0, 600000, `Interval`),
    startDelayMs: integer(input.startDelayMs, 0, 600000, `Start delay`) }
}

export function validateDebugLayout(value: unknown): DebugLayout {
  const input = record(value, `Layout`)
  const result = createDebugLayout()
  for (const name of Object.keys(result) as Array<keyof DebugLayout>) {
    const panel = record(input[name], `Panel ${name}`)
    if (typeof panel.visible !== `boolean`) throw new RangeError(`Panel visibility must be boolean.`)
    result[name] = { visible: panel.visible, x: number(panel.x, 0, 1, `X`), y: number(panel.y, 0, 1, `Y`),
      scale: number(panel.scale, 0.5, 2, `Scale`), opacity: number(panel.opacity, 0.1, 1, `Opacity`) }
  }
  return result
}

function validateCommand(value: unknown): CoreCommand {
  const command = record(value, `Command`)
  const delay = command.delayMs === undefined ? {} : { delayMs: integer(command.delayMs, 0, 2147483647, `Command delay`) }
  if (command.type === `console`) {
    if (!isConsoleKeyCode(command.consoleKey)) throw new RangeError(`Unsupported console key.`)
    const commandText = text(command.command, 4096, `Console command`)
    if (/[\x00-\x1f\x7f-\x9f]/u.test(commandText)) throw new RangeError(`Console command must be one line without control characters.`)
    const flags: { expectClipboard?: boolean, restoreClipboard?: boolean } = {}
    for (const flag of [`expectClipboard`, `restoreClipboard`] as const) {
      if (command[flag] !== undefined) {
        if (typeof command[flag] !== `boolean`) throw new RangeError(`${flag} must be boolean.`)
        flags[flag] = command[flag]
      }
    }
    return { type: `console`, command: commandText, consoleKey: command.consoleKey, ...delay, ...flags }
  }
  if (command.type === `keys`) {
    const presses = list(command.presses, `Key presses`).map(value => {
      const press = record(value, `Key press`)
      return { virtualKey: integer(press.virtualKey, 1, 254, `Virtual key`), durationMs: integer(press.durationMs, 0, 60000, `Key duration`) }
    })
    const idle = command.minimumIdleMs === undefined ? {} : { minimumIdleMs: integer(command.minimumIdleMs, 0, 2147483647, `Minimum idle`) }
    return { type: `keys`, presses, ...delay, ...idle }
  }
  throw new RangeError(`Command type must be console or keys.`)
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== `object` || Array.isArray(value)) throw new RangeError(`${name} must be an object.`)
  return value as Record<string, unknown>
}

function list(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 999) throw new RangeError(`${name} must contain 1 to 999 items.`)
  return value
}

function text(value: unknown, max: number, name: string, empty = false): string {
  if (typeof value !== `string` || value.length > max || (!empty && !value.trim())) throw new RangeError(`${name} must be ${empty ? `at most` : `1 to`} ${max} characters.`)
  return value
}

function number(value: unknown, min: number, max: number, name: string): number {
  if (typeof value !== `number` || !Number.isFinite(value) || value < min || value > max) throw new RangeError(`${name} must be between ${min} and ${max}.`)
  return value
}

function integer(value: unknown, min: number, max: number, name: string): number {
  const result = number(value, min, max, name)
  if (!Number.isInteger(result)) throw new RangeError(`${name} must be an integer.`)
  return result
}
