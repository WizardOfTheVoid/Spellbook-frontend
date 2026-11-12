import { fixedVariableDefinitions, type TeamVariable } from './teamVariables.js'
export type { TeamVariable } from './teamVariables.js'
export type TeamSettings = {
  revision: number
  name: string
  tag: string
  isClan: boolean
  discordUrl: string
  logo: string | null
  languages: string[]
  variables: TeamVariable[]
}
export type TeamGuidelineRevision = { revision: number, content: string, authorId: number, authorName: string, createdAt: string }
export type TeamGuidelines = { revision: number, content: string }

export const teamLanguageCodes = `ar bg ca cs da de el en es et fa fi fr he hi hr hu id is it ja ko lt lv nl no pl pt ro ru sk sl sr sv th tr uk vi zh`.split(` `)

export function emptyTeamSettings(name = ``): TeamSettings {
  return { revision: 0, name, tag: ``, isClan: false, discordUrl: ``, logo: null, languages: [], variables: [] }
}

export function resolveTeamDefaults<T extends { clanName: string | null, clanTag: string | null }>(
  server: T, team: TeamSettings | null, messagePrefix = ``
) {
  const fixed = fixedVariableDefinitions.map(variable => ({ ...variable,
    value: variable.key === `discord_url` ? team?.discordUrl ?? `` : messagePrefix }))
  const fixedKeys = new Set<string>(fixed.map(variable => variable.key))
  return {
    server: { ...server, clanName: team?.name || null, clanTag: team?.tag || null },
    variables: [...fixed, ...(team?.variables ?? []).filter(variable => !fixedKeys.has(variable.key))]
  }
}
