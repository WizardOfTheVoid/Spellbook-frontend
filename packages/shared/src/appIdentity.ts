export const appIdentity = Object.freeze({
  name: `SpellBook`,
  creator: `Magic Trashcan`,
  credit: `by Magic Trashcan`,
  appId: `com.magictrashcan.spellbook`,
  protocol: `spellbook`
})

export type AppProtocolHost = `auth` | `discord-install`

export function createAppUrl(host: AppProtocolHost, params?: URLSearchParams): string {
  const query = params?.toString()
  return `${appIdentity.protocol}://${host}${query ? `?${query}` : ``}`
}
