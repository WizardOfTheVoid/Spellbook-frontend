import { productVersion } from './productVersion'

export type UserAgentComponent = `client` | `core` | `api` | `discord`

export function createUserAgent(
  component: UserAgentComponent,
  userId: number | null = null,
  version = productVersion,
  username: string | null = null
): string {
  const account = userId !== null && Number.isSafeInteger(userId) && userId > 0 ? `; userId=${userId}` : ``
  const name = username?.trim()
  const identity = name ? `; username=${encodeURIComponent(name).replace(/[()]/gu, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)}` : ``
  return `TWA-SpellBook/${version} (component=${component}${account}${identity})`
}
