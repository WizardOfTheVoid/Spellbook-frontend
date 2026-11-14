import { appIdentity } from '@spellbook/shared/appIdentity'
import { parsePlayerAppUrl } from '@spellbook/shared/appLinks'

const appProtocolHosts = new Set([`auth`, `discord-install`])

export function findAppProtocolUrl(values: readonly string[]): string | undefined {
  for (const value of values) {
    try {
      const url = new URL(value)
      if (
        url.protocol === `${appIdentity.protocol}:`
        && !url.username
        && !url.password
        && (appProtocolHosts.has(url.hostname) || parsePlayerAppUrl(value) !== null)
      ) return value
    } catch {}
  }
}
