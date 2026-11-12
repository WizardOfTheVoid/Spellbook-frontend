import { consoleKeyLabel, isConsoleKeyCode, type ConsoleKeyCode } from './consoleKey'

export type ShortcutKeyCode = Exclude<ConsoleKeyCode, `IntlBackslash`> | `F3` | `F4`
export type KeybindName = `consoleKey` | `overlayKey` | `quickOpenPlayerKey` | `gameServerKey`
export type KeybindSettings = {
  consoleKey: ConsoleKeyCode | null
  overlayKey: ShortcutKeyCode
  quickOpenPlayerKey: ShortcutKeyCode
  gameServerKey: ShortcutKeyCode | null
}

export const defaultKeybinds: KeybindSettings = { consoleKey: null, overlayKey: `F3`, quickOpenPlayerKey: `F4`, gameServerKey: `F2` }
export const keybindNames = { consoleKey: `Chiv2 Console key`, overlayKey: `Toggle SpellBook`, quickOpenPlayerKey: `Quick Open Player`, gameServerKey: `Open Game Server` }

export function isShortcutKeyCode(value: unknown): value is ShortcutKeyCode {
  return value === `F3` || value === `F4` || (isConsoleKeyCode(value) && value !== `IntlBackslash`)
}

export function keybindValue(settings: Partial<KeybindSettings> | null | undefined, name: KeybindName): ConsoleKeyCode | ShortcutKeyCode | null {
  const value = settings?.[name]
  return value === undefined ? defaultKeybinds[name] : value
}

export function consoleKeyUpdate(settings: KeybindSettings, consoleKey: ConsoleKeyCode): Pick<KeybindSettings, `consoleKey` | `gameServerKey`> {
  const releaseDefault = settings.consoleKey === null && settings.gameServerKey === defaultKeybinds.gameServerKey && consoleKey === settings.gameServerKey
  return { consoleKey, gameServerKey: releaseDefault ? null : settings.gameServerKey }
}

export function keybindLabel(code: ConsoleKeyCode | ShortcutKeyCode | null, name?: KeybindName): string {
  if (name === `gameServerKey` && code === null) return `Not set`
  return code === `F3` || code === `F4` ? code : consoleKeyLabel(code)
}

export function keybindConflict(settings: KeybindSettings): string | null {
  const used = new Map<string, string>()
  for (const name of Object.keys(keybindNames) as KeybindName[]) {
    if (name === `gameServerKey` && settings[name] === null) continue
    const code = settings[name] ?? `NumpadSubtract`
    if (code === `F6`) return `F6 is reserved for Debug HUD visibility. Choose a different key for ${keybindNames[name]}.`
    const previous = used.get(code)
    if (previous) return `${keybindLabel(code)} is already used by ${previous}. Choose a different key for ${keybindNames[name]}.`
    used.set(code, keybindNames[name])
  }
  return null
}

export function shortcutAccelerator(code: ShortcutKeyCode): string {
  const symbols: Record<string, string> = {
    Backquote: `\``, Minus: `-`, Equal: `=`, BracketLeft: `[`, BracketRight: `]`,
    Backslash: `\\`, Semicolon: `;`, Quote: `'`, Comma: `,`, Period: `.`, Slash: `/`,
    NumpadSubtract: `numsub`, NumpadAdd: `numadd`, NumpadMultiply: `nummult`,
    NumpadDivide: `numdiv`, NumpadDecimal: `numdec`
  }
  return symbols[code] ?? code.replace(/^Key|^Digit/u, ``).replace(/^Numpad/u, `num`).replace(/^Arrow/u, ``)
}

export function syncedSettings<T extends object>(settings: T): Omit<T, KeybindName | `debug`> {
  const { consoleKey, overlayKey, quickOpenPlayerKey, gameServerKey, debug, ...synced } = settings as T & Partial<KeybindSettings> & { debug?: boolean }
  return synced
}
