export const discordConfigurationFields = [`roleId`, `updatesChannelId`, `helpChannelId`, `statisticsChannelId`] as const
export type DiscordConfigurationField = typeof discordConfigurationFields[number]
export const discordConfigurationLabels: Record<DiscordConfigurationField, string> = {
  roleId: `SpellBook role`, updatesChannelId: `Updates channel`, helpChannelId: `Help channel`, statisticsChannelId: `Statistics channel`
}

export type DiscordConfiguration = Record<DiscordConfigurationField, string | null> & {
  guildId: string
  connectionId: number
  guildName: string
  revision: number
}

export type DiscordConfigurationPatch = Partial<Record<DiscordConfigurationField, string | null>> & {
  guildId: string
  connectionId: number
  revision: number
}

export type DiscordGuildResources = {
  roles: Array<{ id: string, name: string }>
  channels: Array<{ id: string, name: string, category?: string, categoryId?: string, canSend: boolean, reason?: string }>
}

export function readDiscordConfigurationPatch(value: unknown): DiscordConfigurationPatch {
  if (!value || typeof value !== `object`) throw new RangeError(`Invalid Discord configuration.`)
  const input = value as Record<string, unknown>
  const validId = (id: unknown): id is string => typeof id === `string` && /^\d{17,20}$/u.test(id)
  if (!validId(input.guildId) || !Number.isSafeInteger(input.connectionId) || (input.connectionId as number) < 1
    || !Number.isSafeInteger(input.revision) || (input.revision as number) < 0) {
    throw new RangeError(`Invalid Discord configuration revision or guild.`)
  }
  const patch: DiscordConfigurationPatch = { guildId: input.guildId, connectionId: input.connectionId as number, revision: input.revision as number }
  for (const field of discordConfigurationFields) {
    if (!(field in input)) continue
    if (input[field] !== null && !validId(input[field])) throw new RangeError(`Invalid ${field}.`)
    patch[field] = input[field] as string | null
  }
  return patch
}

export function discordConfigurationChanges(saved: DiscordConfiguration, draft: DiscordConfiguration): DiscordConfigurationPatch {
  const patch: DiscordConfigurationPatch = { guildId: saved.guildId, connectionId: saved.connectionId, revision: saved.revision }
  for (const field of discordConfigurationFields) if (saved[field] !== draft[field]) patch[field] = draft[field]
  return patch
}
