import type { PlayerTimelinePage } from '@spellbook/shared/playerTimeline'
import { getServerApi } from '$lib/core'
import { unwrap } from './apiResult'

export async function fetchPlayerTimeline(playerId: number, before?: string): Promise<PlayerTimelinePage> {
  return unwrap<PlayerTimelinePage>(
    await getServerApi().playerTimeline(playerId, 30, before),
    `Player timeline request failed.`
  )
}
