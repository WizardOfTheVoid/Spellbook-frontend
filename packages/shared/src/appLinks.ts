import { appIdentity } from './appIdentity'

const playerIdPattern = /^[A-Za-z0-9_-]{4,128}$/u

export type PendingPlayerLink = { sequence: number, playfabId: string }

export const validPlayerLinkId = (value: string): boolean => playerIdPattern.test(value)

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
