import anyAscii from 'any-ascii'
import { symbolNormalization } from './symbolNormalization.js'
import { normalizeScriptText } from './normalizeScriptText.js'

export type NormalizationType = `game` | `name`

// Shared by text sent to Core and player names that need a normalized representation.
export function normalizeString(type: NormalizationType, value: string): string {
  const text = normalizeScriptText(value, symbolNormalization)
    .replace(type === `game` ? / {3,}/g : / {2,}/g, type === `game` ? `  ` : ` `)
    .replace(/\t/g, ` `)

  return normalizeScriptText(text, anyAscii).trim()
}
