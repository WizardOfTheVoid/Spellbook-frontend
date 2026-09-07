import type { GameServerParam } from "$lib/core"
import {
  findMissingTemplateVariables,
  messageTemplatePattern,
  resolveTemplate
} from "../../../../shared/messageTemplates"

export type MessageTagDefinition = {
  key: string
  tag: string
  description: string
}

export type MessageTagItem = {
  tag: string
  tooltip: string
  disabled?: boolean
}

export type MessageVariable = Pick<GameServerParam, `key` | `value`>
  & Partial<Omit<GameServerParam, `key` | `value`>>

export type MessageTagContext = {
  user?: string
  duration?: string
  admin?: string
  playfab?: string
  offenses?: string
  serverName?: string
  clanName?: string
  clanTag?: string
  variables?: readonly MessageVariable[]
}

export type MessageTagInsertion = {
  value: string
  selectionStart: number
  selectionEnd: number
}

export const messageTagDefinitions: readonly MessageTagDefinition[] = [
  { key: `user`, tag: `[user]`, description: `Player display name` },
  { key: `duration`, tag: `[duration]`, description: `Command time in hours or MAX` },
  { key: `admin`, tag: `[admin]`, description: `Selected admin username` },
  { key: `playfab`, tag: `[playfab]`, description: `Player PlayFab ID` },
  { key: `offenses`, tag: `[offenses]`, description: `Recorded offense count` },
  { key: `server_name`, tag: `[server_name]`, description: `Active server name, set on Servers` },
  { key: `clan_name`, tag: `[clan_name]`, description: `Active server clan name, set on Servers` },
  { key: `clan_tag`, tag: `[clan_tag]`, description: `Active server clan tag, set on Servers` }
] as const

export const messageTagPattern = messageTemplatePattern
const contextualTagKeys = new Set(messageTagDefinitions.map(definition => definition.key))

export function resolveMessageTemplate(
  template: string,
  context: MessageTagContext
): string {
  return resolveTemplate(template, messageTagValues(context), context.variables)
}

export function missingMessageVariables(
  templates: readonly string[],
  variables: readonly MessageVariable[]
): string[] {
  return findMissingTemplateVariables(templates, variables, contextualTagKeys)
}

export function insertMessageTag(
  value: string,
  tag: string,
  selectionStart: number,
  selectionEnd: number,
  maxLength: number
): MessageTagInsertion {
  const start = Math.min(clamp(selectionStart, value.length), clamp(selectionEnd, value.length))
  const end = Math.max(clamp(selectionStart, value.length), clamp(selectionEnd, value.length))
  const nextValue = `${value.slice(0, start)}${tag}${value.slice(end)}`

  if (nextValue.length > maxLength) {
    return { value, selectionStart: start, selectionEnd: end }
  }

  const caret = start + tag.length
  return { value: nextValue, selectionStart: caret, selectionEnd: caret }
}

function messageTagValues(context: MessageTagContext): Record<string, string> {
  return {
    user: context.user ?? ``,
    duration: context.duration ?? ``,
    admin: context.admin ?? ``,
    playfab: context.playfab ?? ``,
    offenses: context.offenses ?? ``,
    server_name: context.serverName ?? ``,
    clan_name: context.clanName ?? ``,
    clan_tag: context.clanTag ?? ``
  }
}

function clamp(value: number, max: number): number {
  return Math.min(Math.max(value, 0), max)
}
