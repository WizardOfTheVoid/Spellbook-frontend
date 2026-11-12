import { contextualMessageKeys } from './actions/tagTypeDefinitions.js'

export type TeamVariable = { label: string, key: string, value: string }
export type VariableDefinition = Pick<TeamVariable, `label` | `key`>
export type VariableValue = Pick<TeamVariable, `key` | `value`>

export const fixedVariableDefinitions = [
  { key: `discord_url`, label: `Discord URL` },
  { key: `adminsay_prefix`, label: `Adminsay prefix` },
  { key: `serversay_prefix`, label: `Serversay prefix` }
] as const

const fixedKeys = new Set<string>(fixedVariableDefinitions.map(variable => variable.key))
const reservedKeys = new Set<string>(contextualMessageKeys)

export function slugVariableLabel(label: string): string {
  return label.normalize(`NFKD`).replace(/[\u0300-\u036f]/gu, ``).toLowerCase()
    .replace(/[^a-z0-9]+/gu, `_`).replace(/^_+|_+$/gu, ``)
}

export function variableKeyError(label: string, otherKeys: readonly string[]): string | null {
  if (!label.trim()) return `Name is required.`
  if (label.trim().length > 64) return `Name must be 64 characters or fewer.`
  const key = slugVariableLabel(label)
  if (!key) return `Name needs at least one letter or number.`
  if (key.length > 32) return `Tag must be 32 characters or fewer.`
  if (/^[0-9]/u.test(key)) return `Name must start with a letter.`
  if (reservedKeys.has(key)) return `[${key}] is a reserved tag.`
  if (fixedKeys.has(key)) return `[${key}] is a fixed variable.`
  if (otherKeys.includes(key)) return `[${key}] is already used.`
  return null
}

export function variableErrors(variables: readonly Pick<TeamVariable, `label` | `key`>[]): (string | null)[] {
  return variables.map((variable, index) => variableKeyError(variable.label,
    variables.filter((_, other) => other !== index).map(other => other.key)))
}

export function withFixedVariableDefinitions(definitions: readonly VariableDefinition[]): VariableDefinition[] {
  const byKey = new Map<string, VariableDefinition>(fixedVariableDefinitions.map(variable => [variable.key, variable]))
  for (const variable of definitions) if (!byKey.has(variable.key)) byKey.set(variable.key, variable)
  return [...byKey.values()]
}
