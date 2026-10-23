import type { ConsoleKeyCode } from './consoleKey'

export type KeyboardLayoutId = string
export type KeyboardLayout = Readonly<{ id: KeyboardLayoutId, displayName: string }>
export type VerifiedConsoleBinding = Readonly<{ key: ConsoleKeyCode, layoutId: KeyboardLayoutId, checkedAt: string }>
export type ConsoleLayoutSelection = Readonly<{ layoutId: KeyboardLayoutId, source: `detected` | `manual` }>

export function isKeyboardLayoutId(value: unknown): value is KeyboardLayoutId {
  return typeof value === `string` && /^[0-9a-f]{8}$/i.test(value) && value !== `00000000`
}
