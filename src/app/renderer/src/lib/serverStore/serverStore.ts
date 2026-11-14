import { getServerApi, type GameServerPlayers } from '$lib/core'
import { unwrap } from '$lib/utils/apiResult'
import type { PlayerPresence } from '@spellbook/shared/playerPresence'
import { ServerStoreCache } from './serverStoreCache'

export const serverStore = new ServerStoreCache({
  roster: async id => unwrap<GameServerPlayers>(await getServerApi().gameServers.players(id), `Server players request failed.`),
  presence: async ids => unwrap<Record<number, PlayerPresence>>(await getServerApi().gameServers.presence(ids), `Player presence request failed.`)
})
