import { appIdentity } from './appIdentity'
import { hasKnownPlayfabId } from './playerIdentity'

const playerIdPattern = /^[A-Za-z0-9_-]{4,128}$/u

export const spellbookDownloadUrl = `https://chivalry2.dev/download`

export type PendingPlayerLink = { sequence: number, playfabId: string, kind?: `player` | `wanted` | `evidence`, token?: string }

export const validPlayerLinkId = (value: string): boolean => hasKnownPlayfabId(value) && playerIdPattern.test(value)

export function createPlayerWebUrl(playfabId: string): string {
  if (!validPlayerLinkId(playfabId)) throw new RangeError(`Invalid PlayFab ID`)
  return `https://chivalry2.dev/sb/players/${encodeURIComponent(playfabId)}`
}

export function createPlayerAppUrl(playfabId: string): string {
  if (!validPlayerLinkId(playfabId)) throw new RangeError(`Invalid PlayFab ID`)
  return `${appIdentity.protocol}://players/${encodeURIComponent(playfabId)}`
}

export function parsePlayerAppUrl(value: string): { playfabId: string } | null {
  try {
    const url = new URL(value)
    if (url.protocol !== `${appIdentity.protocol}:` || url.host !== `players`
      || url.username || url.password || url.search || url.hash
      || !/^\/[^/]+$/u.test(url.pathname) || /%2f|%5c/iu.test(url.pathname)) return null
    const playfabId = decodeURIComponent(url.pathname.slice(1))
    return validPlayerLinkId(playfabId) && value === createPlayerAppUrl(playfabId)
      ? { playfabId }
      : null
  } catch {
    return null
  }
}

export function parseAppUrl(value: string): { kind: `player` | `wanted`, playfabId: string } | { kind: `evidence`, token: string } | null {
  const player = parsePlayerAppUrl(value)
  if (player) return { kind: `player`, ...player }
  try {
    const url = new URL(value)
    if (url.protocol !== `${appIdentity.protocol}:` || url.username || url.password || url.search || url.hash
      || !/^\/[^/]+$/u.test(url.pathname) || /%2f|%5c/iu.test(url.pathname)) return null
    const segment = decodeURIComponent(url.pathname.slice(1))
    if (url.host === `wanted` && validPlayerLinkId(segment)
      && value === `${appIdentity.protocol}://wanted/${encodeURIComponent(segment)}`) {
      return { kind: `wanted`, playfabId: segment }
    }
    if (url.host === `evidence` && /^[a-f0-9]{64}$/u.test(segment)
      && value === `${appIdentity.protocol}://evidence/${segment}`) return { kind: `evidence`, token: segment }
    return null
  } catch { return null }
}
