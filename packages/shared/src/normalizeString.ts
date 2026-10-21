import anyAscii from 'any-ascii'
import { createSymbolNormalization, symbolNormalization } from './symbolNormalization.js'
import { normalizeScriptText } from './normalizeScriptText.js'
import nameSeparators from '../assets/nameSeparators.json'

const normalizeNameSeparators = createSymbolNormalization(nameSeparators)

export type NormalizationType = `game` | `name`

// Shared by text sent to Core and player names that need a normalized representation.
export function normalizeString(type: NormalizationType, value: string): string {
  // Leave invalid game text intact so caller validation can see every control character.
  if (type === `game` && /[\r\n\0]/u.test(value)) return value

  const prepared = type === `name` ? normalizeNameSeparators(value) : value
  const withoutStandaloneCrosses = prepared.replace(/(^|\s+)[†‡]+(?=\s|$)/gu,
    (_, whitespace: string) => whitespace.replace(/[^\r\n]/gu, ``))
  const text = normalizeScriptText(withoutStandaloneCrosses, symbolNormalization)
    .replace(type === `game` ? / {3,}/g : / {2,}/g, type === `game` ? `  ` : ` `)
    .replace(/\t/g, ` `)

  const normalized = normalizeScriptText(text, anyAscii)
  if (type === `game`) return normalized.trim()
  const name = normalizeNameSeparators(normalized)
  return (name === normalized ? name : name.replace(/ {2,}/gu, ` `)).trim()
}
