import { normalizeString } from '@spellbook/shared/normalizeString'

const messageRoutes = new Set([`/v2/console/message`, `/v2/console/warn`])
const reasonRoutes = new Set([`/v2/console/ban`, `/v2/console/kick`])
const messageCommands = new Set([`admin_message`, `server_message`, `warn`, `ban`, `kick`])

export function normalizeCoreText(path: string, payload: unknown): unknown {
  if (!isRecord(payload)) return payload
  if (messageRoutes.has(path)) return normalizeField(payload, `message`)
  if (reasonRoutes.has(path)) return normalizeField(payload, `reason`)
  if (path !== `/v2/console/batch` || !Array.isArray(payload.commands)) return payload

  return {
    ...payload,
    commands: payload.commands.map(command => isRecord(command) && messageCommands.has(String(command.commandType))
      ? normalizeField(command, `message`)
      : command)
  }
}

function normalizeField(payload: Record<string, unknown>, field: string): Record<string, unknown> {
  return typeof payload[field] === `string`
    ? { ...payload, [field]: normalizeString(`game`, payload[field]) }
    : payload
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === `object` && value !== null && !Array.isArray(value)
}
