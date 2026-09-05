import consoleKeys from '../../../packages/shared/assets/consoleKeys.json'

export type ConsoleKeyCode = keyof typeof consoleKeys
export const consoleKeyHeader = `X-SpellBook-Console-Key`

export function isConsoleKeyCode(value: unknown): value is ConsoleKeyCode {
  return typeof value === `string` && Object.hasOwn(consoleKeys, value)
}

export function consoleKeyLabel(code: ConsoleKeyCode | null): string {
  return code === null ? `Default (Numpad minus)` : consoleKeys[code].label
}

export function recordedConsoleKey(event: Pick<KeyboardEvent, `code` | `ctrlKey` | `altKey` | `shiftKey` | `metaKey` | `repeat` | `isComposing`>): ConsoleKeyCode | null {
  if (event.ctrlKey || event.altKey || event.shiftKey || event.metaKey || event.repeat || event.isComposing) return null
  return isConsoleKeyCode(event.code) ? event.code : null
}
