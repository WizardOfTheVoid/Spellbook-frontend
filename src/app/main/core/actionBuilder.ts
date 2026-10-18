import { createHash, randomUUID } from 'node:crypto'
import { normalizeString } from '@spellbook/shared/normalizeString'
import { isConsoleKeyCode, type ConsoleKeyCode } from '../../shared/consoleKey'
import type { CoreAction, CoreActionOptions, CoreAppTarget, CoreCommand, CoreConsoleCommand } from '../../shared/coreAction'
import { unbanSubmissionCount } from '../../shared/coreAction'
import type { CoreBatchCommand } from '../types'

type ConsoleOptions = Pick<CoreConsoleCommand, `delayMs` | `expectClipboard` | `restoreClipboard`>

export class ActionBuilder {
  constructor(
    private readonly getConsoleKey: () => ConsoleKeyCode | null = () => null,
    private readonly getOwnPlayfabId: () => string | null = () => null
  ) {}

  validateTargets(commands: CoreCommand[]): void {
    for (const command of commands) {
      if (command?.type !== `console` || typeof command.command !== `string`) continue
      const target = /^\s*(?:banbyid|kickbyid)\s+(?:"([^"]+)"|(\S+))/iu.exec(command.command)
      if (!target) continue
      const ownId = this.getOwnPlayfabId()?.trim().toUpperCase()
      if (!ownId) throw new RangeError(`Your PlayFab ID is unavailable. Ban and kick actions are blocked.`)
      if ((target[1] ?? target[2])?.trim().toUpperCase() === ownId) {
        throw new RangeError(`You cannot ban or kick yourself.`)
      }
    }
  }

  raw(value: string, options: ConsoleOptions = {}): CoreConsoleCommand[] {
    const command = value.trim()
    if (!command || command.length > 512 || /[\r\n\0]/u.test(command)) {
      throw new RangeError(`Command must be one nonempty line of at most 512 characters without NUL.`)
    }
    const unban = /^unbanbyid\s+([A-Za-z0-9_-]{4,128})$/iu.exec(command)
    return unban ? this.unban(unban[1]!, options.delayMs) : [this.console(command, options)]
  }

  message(kind: `admin` | `server`, message: string, delayMs = 0): CoreConsoleCommand[] {
    if (kind !== `admin` && kind !== `server`) throw new RangeError(`Message kind must be admin or server.`)
    return [this.console(`${kind === `admin` ? `Adminsay` : `Serversay`} "${quotedText(message, `Message`)}"`, { delayMs })]
  }

  ban(playfabId: string, hours: number, reason: string, delayMs = 0): CoreConsoleCommand[] {
    if (!Number.isInteger(hours) || hours < 1 || hours > 999999) throw new RangeError(`Ban hours must be between 1 and 999999.`)
    return [this.console(`BanById ${playerId(playfabId)} ${hours} "${quotedText(reason, `Reason`)}"`, { delayMs })]
  }

  kick(playfabId: string, reason: string, delayMs = 0): CoreConsoleCommand[] {
    return [this.console(`KickById ${playerId(playfabId)} "${quotedText(reason, `Reason`)}"`, { delayMs })]
  }

  unban(playfabId: string, delayMs = 0): CoreConsoleCommand[] {
    const command = `UnbanById ${playerId(playfabId)}`
    return Array.from({ length: unbanSubmissionCount }, (_, index) => this.console(command, { delayMs: index === 0 ? delayMs : 0 }))
  }

  batch(commands: CoreBatchCommand[]): CoreConsoleCommand[] {
    if (!commands.length) throw new RangeError(`At least one command is required.`)
    return commands.flatMap(command => {
      if (!command) throw new RangeError(`Command is required.`)
      validateDelay(command.delayMs)
      switch (command.commandType) {
        case `admin_message`: return this.message(`admin`, command.message ?? ``, command.delayMs)
        case `server_message`:
        case `warn`: return this.message(`server`, command.message ?? ``, command.delayMs)
        case `ban`: return this.ban(command.playfabId ?? ``, command.hours ?? 0, command.message ?? ``, command.delayMs)
        case `kick`: return this.kick(command.playfabId ?? ``, command.message ?? ``, command.delayMs)
        case `unban`: return this.unban(command.playfabId ?? ``, command.delayMs)
        default: throw new RangeError(`Command type must be server_message, admin_message, warn, kick, ban, or unban.`)
      }
    })
  }

  private console(command: string, options: ConsoleOptions): CoreConsoleCommand {
    const consoleKey = this.getConsoleKey() ?? `NumpadSubtract`
    if (!isConsoleKeyCode(consoleKey)) throw new RangeError(`Unsupported console key.`)
    if (options.delayMs !== undefined) validateDelay(options.delayMs)
    return { type: `console`, command, consoleKey, ...options }
  }
}

export function buildAction(commands: CoreCommand[], app: CoreAppTarget, options: CoreActionOptions): CoreAction {
  if (!commands.length) throw new RangeError(`At least one command is required.`)
  for (const command of commands) {
    if (command.type === `console` && !isConsoleKeyCode(command.consoleKey)) throw new RangeError(`Unsupported console key.`)
  }
  if (options.ttlMs !== undefined && (!Number.isInteger(options.ttlMs) || options.ttlMs <= 0 || options.ttlMs > 2147483647)) throw new RangeError(`Action TTL must be a positive integer.`)
  const payload = { author: options.author, priority: options.priority, app, commands }
  return { id: options.id ?? randomUUID(), key: createHash(`sha256`).update(stableJson(payload)).digest(`hex`), ...payload, ...(options.ttlMs === undefined ? {} : { ttlMs: options.ttlMs }) }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(`,`)}]`
  if (value && typeof value === `object`) {
    return `{${Object.entries(value).filter(([, field]) => field !== undefined).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, field]) => `${JSON.stringify(key)}:${stableJson(field)}`).join(`,`)}}`
  }
  return JSON.stringify(value)
}

function playerId(value: string): string {
  const id = value.trim()
  if (!/^[A-Za-z0-9_-]{4,128}$/u.test(id)) throw new RangeError(`PlayFab id must match ^[A-Za-z0-9_-]{4,128}$.`)
  return id
}

function quotedText(value: string, name: string): string {
  const text = normalizeString(`game`, value)
  if (/[\r\n\0]/u.test(text)) throw new RangeError(`${name} cannot contain CR, LF, or NUL.`)
  if (!text.trim()) throw new RangeError(`${name} is required.`)
  if (text.includes(`"`)) throw new RangeError(`${name} cannot contain double quotes.`)
  if (text.length > 180) throw new RangeError(`${name} must be 180 characters or fewer.`)
  return text
}

function validateDelay(delayMs: number): void {
  if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > 2147483647) throw new RangeError(`Command delay must be between 0 and 2147483647 milliseconds.`)
}
