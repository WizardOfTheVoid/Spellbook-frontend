import type { PlayerTimelineTarget } from '@spellbook/shared/playerTimeline'
import { getServerApi, type PlayerAction, type PlayerDbProfile } from '$lib/core'
import { unwrap } from '$lib/utils/apiResult'
import { parsePlayerAction } from '$lib/utils/playerActionsApi'
import { fetchPlayerProfile } from '$lib/utils/serverProfilesApi'

export type TimelineActionSelection = PlayerAction & {
  timelineContext?: { playerId: number, playfabId: string, name: string, actions: PlayerAction[] }
}

type ActionReaders = {
  profile: (playfabId: string) => Promise<PlayerDbProfile>
  action: (playerId: number, actionId: number) => Promise<PlayerAction>
}

const readers: ActionReaders = {
  profile: fetchPlayerProfile,
  action: async (playerId, actionId) => parsePlayerAction(await unwrap<unknown>(
    await getServerApi().playerActions.get(playerId, actionId), `Player action request failed.`))
}

export async function loadTimelineAction(target: Extract<PlayerTimelineTarget, { type: `action` }>, current: PlayerDbProfile,
  source: ActionReaders = readers): Promise<TimelineActionSelection> {
  const playerId = target.playerId ?? current.player.id
  const crossPlayer = playerId !== current.player.id
  if (crossPlayer && !target.playfabId) throw new Error(`The affected player's identity is unavailable.`)
  const profile = crossPlayer ? await source.profile(target.playfabId!) : current
  if (profile.player.id !== playerId) throw new Error(`The affected player's identity changed. Reopen Timeline.`)
  const action = profile.actions.find(item => item.id === target.id && item.playerId === playerId)
    ?? await source.action(playerId, target.id)
  if (action.playerId !== playerId) throw new Error(`The action belongs to another player.`)
  return crossPlayer ? { ...action, timelineContext: { playerId, playfabId: profile.player.playfabId,
    name: profile.player.latestName?.trim() || profile.player.playfabId, actions: profile.actions } } : action
}
