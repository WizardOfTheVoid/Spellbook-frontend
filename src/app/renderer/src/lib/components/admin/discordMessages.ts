import type { DiscordBroadcastResult } from '@spellbook/shared/discordBroadcasts.js'

export type DiscordMessageMode = `broadcast` | `release` | `targeted`

export function discordQueueMessage(result: DiscordBroadcastResult): string {
	return result.targets === 0
		? `No messages queued. No Discord servers are configured to receive updates.`
		: `Message queued for ${result.targets} Discord server${result.targets === 1 ? `` : `s`}.`
}
