import type { PlayerPresence } from '@spellbook/shared/playerPresence.js'
import { isRecord } from './records'

export function formatPlayerPresenceTooltip(presence: PlayerPresence | null | undefined): string {
  if (!presence?.isOnline) return ``
  const name = presence.server?.name.trim()
  const seconds = presence.durationSeconds === undefined
    ? presence.server?.durationSeconds ?? null : presence.durationSeconds
  if (seconds === null) return name || `In a server`
  const [divisor, unit]: [number, string] = seconds < 60 ? [1, `sec`] : seconds < 3600 ? [60, `min`] : [3600, `hrs`]
  const duration = `${Math.floor(seconds / divisor)}+ ${unit}`
  return name ? `${name} (${duration})` : `In a server for ${duration}`
}

export function parsePlayerPresence(value: unknown): PlayerPresence | null {
  if (value === undefined || value === null) return null
  if (!isRecord(value) || typeof value.isOnline !== `boolean` || !isDate(value.observedAt)
    || value.durationSeconds !== undefined && !isDuration(value.durationSeconds)) {
    throw new Error(`Invalid player presence.`)
  }
  const server = value.server
  if (server !== null && (!isRecord(server)
    || !Number.isSafeInteger(server.id) || Number(server.id) <= 0
    || typeof server.name !== `string`
    || !isDuration(server.durationSeconds)
    || !isDate(server.durationObservedAt))) {
    throw new Error(`Invalid player presence.`)
  }
  return {
    isOnline: value.isOnline,
    observedAt: value.observedAt,
    ...(value.durationSeconds === undefined ? {} : { durationSeconds: value.durationSeconds as number | null }),
    server: server === null ? null : {
      id: server.id as number,
      name: server.name as string,
      durationSeconds: server.durationSeconds as number | null,
      durationObservedAt: server.durationObservedAt as string | null
    }
  }
}

function isDuration(value: unknown): value is number | null {
  return value === null || typeof value === `number` && Number.isInteger(value) && value >= 0 && value <= 4294967295
}

function isDate(value: unknown): value is string | null {
  return value === null || typeof value === `string` && Number.isFinite(Date.parse(value))
}
