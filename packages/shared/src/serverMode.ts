export const serverModes = [`Social`, `Duels`, `FFA`, `Mixed`, `TO`, `LTS`] as const
export type ServerMode = typeof serverModes[number]

const duelWords = [`duel`, `1v1`, `1 v 1`, `flourish`]

export function getServerMode(server: Readonly<{ name: string, mapName: string | null, official: boolean | null }>): ServerMode | null {
  const title = server.name.toLowerCase()
  const map = server.mapName?.trim().split(/[\\/.:]/u).at(-1)?.toUpperCase() ?? ``
  const nonNitrado = server.official !== false
  if (nonNitrado && title.includes(`social`)) return `Social`
  if (map.startsWith(`FFA_`)) return duelWords.some(word => title.includes(word)) ? `Duels` : `FFA`
  if (nonNitrado && title.includes(`mixed`)) return `Mixed`
  if (map.startsWith(`TO_`)) return `TO`
  if (map.startsWith(`LTS_`)) return `LTS`
  return null
}
