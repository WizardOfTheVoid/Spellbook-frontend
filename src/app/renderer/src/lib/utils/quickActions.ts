import type { GameServerParam, ServerVariableDefinition } from "$lib/core"
import {
  messageTagDefinitions,
  resolveMessageTemplate,
  type MessageTagContext,
  type MessageTagItem,
  type MessageVariable
} from "./messageTags"
import { applyServerMessagePrefix, RESERVED_VARIABLE_KEYS } from "./serverVariables"

export type QuickActionMessageKind = "admin" | "server"

export type QuickActionMessageContext = Pick<
  MessageTagContext,
  "admin" | "serverName" | "clanName" | "clanTag" | "variables"
>

const quickActionBuiltInKeys = new Set([
  `admin`,
  `server_name`,
  `clan_name`,
  `clan_tag`
])
const reservedVariableKeys = new Set<string>(RESERVED_VARIABLE_KEYS)
const unavailableVariableTooltip = `Not configured for this server. Configure it under Servers > Variables or type a fallback.`

export function quickActionTagItems(
  definitions: readonly ServerVariableDefinition[],
  variables: readonly (MessageVariable & Pick<GameServerParam, `label`>)[],
  context: QuickActionMessageContext
): MessageTagItem[] {
  const contextValues = new Map<string, string | undefined>([
    [`admin`, context.admin],
    [`server_name`, context.serverName],
    [`clan_name`, context.clanName],
    [`clan_tag`, context.clanTag]
  ])
  const builtIns = messageTagDefinitions
    .filter((item) => quickActionBuiltInKeys.has(item.key))
    .map(item => tagItem(item.tag, item.description, contextValues.get(item.key)))
  const values = new Map(variables.map(variable => [variable.key, variable.value]))
  const definitionMap = new Map<string, ServerVariableDefinition>()
  for (const definition of [...definitions, ...variables]) {
    if (!reservedVariableKeys.has(definition.key) && !definitionMap.has(definition.key)) {
      definitionMap.set(definition.key, { key: definition.key, label: definition.label })
    }
  }
  const serverVariables = [...definitionMap.values()].map(variable =>
    tagItem(`[${variable.key}]`, variable.label, values.get(variable.key))
  )
  const items = [...builtIns, ...serverVariables]

  return items.filter((item, index) =>
    items.findIndex((candidate) => candidate.tag === item.tag) === index
  )
}

export function resolveQuickActionMessage(
  message: string,
  context: QuickActionMessageContext,
  kind: QuickActionMessageKind | null = null
): string {
  const resolved = resolveMessageTemplate(message, {
    ...context,
    variables: context.variables?.filter(variable => !reservedVariableKeys.has(variable.key))
  })
  return kind ? applyServerMessagePrefix(resolved, kind, context.variables ?? []) : resolved
}

function tagItem(tag: string, tooltip: string, value: string | undefined): MessageTagItem {
  const disabled = !value?.trim()
  return {
    tag,
    tooltip: disabled ? unavailableVariableTooltip : tooltip,
    disabled
  }
}
