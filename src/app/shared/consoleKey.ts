import consoleKeys from '../../../packages/shared/assets/consoleKeys.json'

export type ConsoleKeyCode = keyof typeof consoleKeys

export function isConsoleKeyCode(value: unknown): value is ConsoleKeyCode {
  return typeof value === `string` && Object.hasOwn(consoleKeys, value)
}

export function consoleKeyLabel(code: ConsoleKeyCode | null): string {
  return code === null ? `Default (Numpad minus)` : consoleKeys[code].label
}
