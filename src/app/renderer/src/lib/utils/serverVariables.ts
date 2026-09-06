import type { GameServerParam, ServerVariableDefinition } from '$lib/core'

export const FIXED_SERVER_VARIABLES = [
  { key: `discord_url`, label: `Discord URL` },
  { key: `adminsay_prefix`, label: `Adminsay prefix` },
  { key: `serversay_prefix`, label: `Serversay prefix` }
] as const

export const RESERVED_VARIABLE_KEYS = [
  `user`, `duration`, `admin`, `playfab`, `offenses`, `server_name`, `clan_name`, `clan_tag`
] as const

const maxKeyLength = 32
const fixedKeys = new Set<string>(FIXED_SERVER_VARIABLES.map(variable => variable.key))
const reservedKeys = new Set<string>(RESERVED_VARIABLE_KEYS)

export function slugServerVariableLabel(label: string): string {
  return label
    .normalize(`NFKD`)
    .replace(/[\u0300-\u036f]/g, ``)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, `_`)
    .replace(/^_+|_+$/g, ``)
    .slice(0, maxKeyLength)
    .replace(/_+$/g, ``)
}

export function isFixedVariableKey(key: string): boolean {
  return fixedKeys.has(key)
}

export function serverVariableKeyError(label: string, otherKeys: readonly string[]): string | null {
  if (label.trim().length === 0) return `Name is required.`
  const key = slugServerVariableLabel(label)
  if (key.length === 0) return `Name needs at least one letter or number.`
  if (/^[0-9]/.test(key)) return `Name must start with a letter.`
  if (reservedKeys.has(key)) return `[${key}] is a reserved tag.`
  if (fixedKeys.has(key)) return `[${key}] is a fixed variable.`
  if (otherKeys.includes(key)) return `[${key}] is already used.`
  return null
}

export function variableTagEntries(
  definitions: readonly ServerVariableDefinition[]
): Array<{ tag: string, label: string }> {
  return definitions.map(variable => ({ tag: `[${variable.key}]`, label: variable.label }))
}

export function fixedVariableRows(variables: readonly GameServerParam[]): GameServerParam[] {
  return FIXED_SERVER_VARIABLES.map((fixed, index) => {
    const existing = variables.find(variable => variable.key === fixed.key)
    return {
      id: existing?.id ?? 0,
      gameServerId: existing?.gameServerId ?? variables[0]?.gameServerId ?? 0,
      label: fixed.label,
      key: fixed.key,
      value: existing?.value ?? ``,
      sortOrder: index
    }
  })
}

export function customVariableRows(variables: readonly GameServerParam[]): GameServerParam[] {
  return variables.filter(variable => !fixedKeys.has(variable.key))
}

export function applyServerMessagePrefix(
  message: string,
  kind: `admin` | `server`,
  variables: readonly Pick<GameServerParam, `key` | `value`>[]
): string {
  const prefix = variables.find(variable => variable.key === `${kind}say_prefix`)?.value.trimEnd() ?? ``
  return prefix ? `${prefix} ${message}` : message
}
