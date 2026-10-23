import { productVersion } from './productVersion'

export type UserAgentComponent = `client` | `core` | `api` | `discord`

export function createUserAgent(component: UserAgentComponent, userId: number | null = null, version = productVersion): string {
  const account = userId !== null && Number.isSafeInteger(userId) && userId > 0 ? `; userId=${userId}` : ``
  return `TWA-SpellBook/${version} (component=${component}${account})`
}
