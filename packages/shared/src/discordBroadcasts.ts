export type DiscordBroadcastMessage = {
  title: string
  description: string
  url?: string
  fields?: Array<{ name: string, value: string, inline?: boolean }>
}

export type DiscordBroadcastGuild = { guildId: string, name: string }
export type DiscordBroadcastResult = { batchId: string, targets: number }
export type DiscordReleasePreview = { version: string, payload: DiscordBroadcastMessage }

export type DiscordQueueStatus = `queued` | `sending` | `retrying` | `blocked` | `sent`
export type DiscordQueueEntry = {
  id: number
  batchId: string
  guildId: string
  guildName: string
  channelId: string | null
  title: string
  description: string
  status: DiscordQueueStatus
  attempts: number
  createdAt: string
  nextAttemptAt: string
  sentAt: string | null
  lastError: string | null
}
export type DiscordQueuePage = { deliveries: DiscordQueueEntry[], nextBeforeId: number | null }
