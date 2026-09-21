export type TagDefinitionGroup = `tag` | `action` | `offense`
export type TagTypeDefinition = {
  group: TagDefinitionGroup
  slug: string
  name: string
  alt: string | null
  pastTense: string | null
  revision: number
}

const row = (group: TagDefinitionGroup, slug: string, name: string, alt: string | null = null, pastTense: string | null = null): TagTypeDefinition =>
  ({ group, slug, name, alt, pastTense, revision: 1 })

export const defaultTagDefinitions: readonly TagTypeDefinition[] = [
  row(`tag`, `user`, `Player name`),
  row(`tag`, `duration`, `Duration`),
  row(`tag`, `admin`, `Admin name`),
  row(`tag`, `playfab`, `PlayFab ID`),
  row(`tag`, `offenses`, `Offense count`, `ordinal`),
  row(`tag`, `offense_type`, `Offense type`, null, `action`),
  row(`tag`, `action_type`, `Action type`, null, `action`),
  row(`tag`, `admins_online`, `Admins online`),
  row(`tag`, `players_online`, `Players online`),
  row(`tag`, `player_rank`, `Player rank`),
  row(`tag`, `last_login`, `Last login`, `days`),
  row(`tag`, `playtime`, `Playtime in hours`),
  row(`tag`, `current_time`, `Current time`),
  row(`tag`, `current_time_utc`, `Current time UTC`),
  row(`tag`, `server_name`, `Server name`),
  row(`tag`, `clan_name`, `Clan name`),
  row(`tag`, `clan_tag`, `Clan tag`),
  row(`action`, `ban`, `Ban`, null, `banned`),
  row(`action`, `kick`, `Kick`, null, `kicked`),
  row(`action`, `warn`, `Warn`, null, `warned`),
  row(`action`, `unban`, `Unban`, null, `unbanned`),
  row(`offense`, `hacker`, `Hacker`),
  row(`offense`, `ffa`, `FFA`),
  row(`offense`, `verbal_abuse`, `Verbal Abuse`),
  row(`offense`, `griefing`, `Griefing`),
  row(`offense`, `exploiting`, `Exploiting`),
  row(`offense`, `toxic_behavior`, `Toxic Behavior`),
  row(`offense`, `low_level`, `Low Level`),
  row(`offense`, `votekick_abuse`, `Votekick Abuse`),
  row(`offense`, `other`, `Other`)
]

export const contextualMessageKeys = new Set(defaultTagDefinitions.filter(row => row.group === `tag`)
  .flatMap(row => [row.slug, ...(row.alt ? [`${row.slug}_alt`] : []), ...(row.pastTense ? [`${row.slug}_pt`] : [])]))

export function tagDefinitionRows(definitions: readonly TagTypeDefinition[] = []): TagTypeDefinition[] {
  const overrides = new Map(definitions.map(row => [`${row.group}:${row.slug}`, row]))
  return defaultTagDefinitions.map(row => overrides.get(`${row.group}:${row.slug}`) ?? row)
}

export function ordinal(value: string): string {
  if (!/^\d+$/u.test(value) || !Number.isSafeInteger(Number(value))) return ``
  const count = Number(value)
  const teen = count % 100
  const suffix = teen >= 11 && teen <= 13 ? `th` : ({ 1: `st`, 2: `nd`, 3: `rd` } as Record<number, string>)[count % 10] ?? `th`
  return `${count}${suffix}`
}

export function definedMessageValues(values: Readonly<Record<string, string>>, definitions?: readonly TagTypeDefinition[]): Record<string, string> {
  const rows = tagDefinitionRows(definitions)
  const word = (group: TagDefinitionGroup, slug: string) => rows.find(row => row.group === group && row.slug === slug)
  const action = word(`action`, values.action_type ?? ``)
  const resolved = Object.fromEntries([...contextualMessageKeys].map(key => [key, ``]))
  for (const row of rows.filter(row => row.group === `tag`)) {
    const value = values[row.slug] ?? ``
    resolved[row.slug] = row.slug === `offense_type` ? word(`offense`, value)?.name ?? ``
      : row.slug === `action_type` ? action?.name ?? `` : value
    if (row.alt === `days`) resolved[`${row.slug}_alt`] = values[`${row.slug}_alt`] ?? ``
    if (row.alt === `ordinal`) resolved[`${row.slug}_alt`] = ordinal(value)
    if (row.pastTense === `action`) resolved[`${row.slug}_pt`] = action?.pastTense ?? ``
  }
  return resolved
}
