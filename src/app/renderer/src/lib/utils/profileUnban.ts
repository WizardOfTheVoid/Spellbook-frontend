import { getServerApi, type RecordUnbanByPlayfabInput } from '$lib/core'
import { unwrap } from './apiResult'
import { getWantedPlayer } from './wantedActionsApi'

export type ProfileUnbanApi = {
  fetchWanted: (playerId: number) => Promise<unknown>
  record: (input: RecordUnbanByPlayfabInput, related?: { playerId: number, actionId: number }) => Promise<unknown>
}

export const profileUnbanApi: ProfileUnbanApi = {
  fetchWanted: getWantedPlayer,
  record: async (input, related) => unwrap(related
    ? await getServerApi().playerActions.unban(related.playerId, related.actionId, { gameServerId: input.gameServerId, reason: input.reason })
    : await getServerApi().recordUnbanByPlayfab(input), `Unban audit failed.`),
}
