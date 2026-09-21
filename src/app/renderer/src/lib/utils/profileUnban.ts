import { getServerApi, type RecordUnbanByPlayfabInput } from '$lib/core'
import { unwrap } from './apiResult'
import { actionsApi } from './actionsApi'

export type ProfileUnbanApi = {
  validate: (playerId: number, gameServerId: number, actionId?: number) => Promise<unknown>
  record: (input: RecordUnbanByPlayfabInput, related?: { playerId: number, actionId: number, removeOffense?: boolean }) => Promise<unknown>
}

export const profileUnbanApi: ProfileUnbanApi = {
  validate: (id, gameServerId, actionId) => actionsApi(`validateUnban`, { id, gameServerId, actionId }),
  record: async (input, related) => unwrap(related
    ? await getServerApi().playerActions.unban(related.playerId, related.actionId, { gameServerId: input.gameServerId, reason: input.reason, ...(related.removeOffense ? { removeOffense: true } : {}) })
    : await getServerApi().recordUnbanByPlayfab(input), `Unban audit failed.`),
}
