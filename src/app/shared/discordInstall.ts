export type DiscordInstallResult = {
  status: `success` | `error`
  teamId?: number
  guildId?: string
  guildName?: string
  message?: string
}
