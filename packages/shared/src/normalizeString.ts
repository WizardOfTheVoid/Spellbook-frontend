import anyAscii from 'any-ascii'
import { symbolNormalization } from './symbolNormalization.js'
import { normalizeScriptText } from './normalizeScriptText.js'

export type NormalizationType = `game` | `name`

// Shared by text sent to Core and player names that need a normalized representation.
export function normalizeString(type: NormalizationType, value: string): string {
  // Leave invalid game text intact so caller validation can see every control character.
  if (type === `game` && /[\r\n\0]/u.test(value)) return value

  const withoutStandaloneCrosses = value.replace(/(^|\s+)[†‡]+(?=\s|$)/gu,
    (_, whitespace: string) => whitespace.replace(/[^\r\n]/gu, ``))
  const text = normalizeScriptText(withoutStandaloneCrosses, symbolNormalization)
    .replace(type === `game` ? / {3,}/g : / {2,}/g, type === `game` ? `  ` : ` `)
    .replace(/\t/g, ` `)

  return normalizeScriptText(text, anyAscii).trim()
}
