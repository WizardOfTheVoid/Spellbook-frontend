import type { NotificationCallback } from './notifications.js'

const topLevelPages = new Set([
  `server`,
  `players`,
  `wanted`,
  `servers`,
  `profiles`,
  `notifications`,
  `account`,
  `teams`,
  `settings`,
  `admin`
])

export function parseNotificationCallback(value: unknown): NotificationCallback | null {
  if (!value || typeof value !== `object`) return null

  const { label, uri } = value as Record<string, unknown>
  if (typeof label !== `string` || label.trim() === `` || typeof uri !== `string`) return null
  if (!isNotificationCallbackUri(uri)) return null

  return { label, uri: uri as `/${string}` }
}

export function isNotificationCallbackUri(uri: string): uri is `/${string}` {
  if (!uri.startsWith(`/`) || uri.startsWith(`//`) || uri.endsWith(`/`) || uri.includes(`://`)) return false

  const parts = uri.slice(1).split(`/`)
  if (parts.length === 1) return topLevelPages.has(parts[0] ?? ``)
  if (parts.length === 3) {
    const [page, id, subpage] = parts
    return (page === `teams` && /^[1-9]\d*$/u.test(id ?? ``) && subpage === `requests`)
      || page === `players` && /^[A-Za-z0-9_-]+$/u.test(id ?? ``) && subpage === `notes`
  }
  if (parts.length !== 2) return false

  const [page, id] = parts
  return (page === `teams` && /^\d+$/u.test(id ?? ``))
    || (page === `wanted` && /^[A-Za-z0-9_-]+$/u.test(id ?? ``))
}
