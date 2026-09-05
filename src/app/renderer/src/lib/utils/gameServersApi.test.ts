import assert from 'node:assert/strict'
import test from 'node:test'
import { get } from 'svelte/store'
import type {
  ChivServerApi,
  CoreCallResult,
  GameServerListPage,
  GameServerProfile,
  GameServerRecord
} from '$lib/core'

const server: GameServerRecord = {
  id: 7,
  externalId: `lobby-7`,
  name: `[TT] DUEL`,
  displayName: `Templars Duel`,
  clanName: `The Templars`,
  clanTag: `TT`,
  region: `EU`,
  mapName: `FFA_Duelyard`,
  gameMode: `FFA`,
  buildId: `261891`,
  host: `5.83.168.223`,
  port: 10010,
  queryPort: 15010,
  pingPort: 20010,
  serverHostname: `duel.example.test`,
  maxPlayers: 40,
  official: false,
  platform: `any`,
  buildVersion: `dummy`,
  runTime: 100,
  gameServerState: 0,
  lastHeartbeat: 1_787_246_707,
  lastSeen: `2026-08-29T10:00:00.000Z`,
  deletedAt: null,
  createdAt: `2026-08-13T10:00:00.000Z`
}

const meta = {
  currentPage: 1,
  pageSize: 100 as const,
  totalPages: 1,
  totalResults: 1,
  hasPrevious: false,
  hasNext: false
}

test(`gets one filtered server page`, async () => {
  const calls: unknown[] = []
  setServerApi({
    list: async (query = {}) => {
      calls.push(query)
      return result({ servers: [server], meta })
    }
  })
  const { getServers } = await import('./gameServersApi')

  assert.deepEqual(await getServers({ official: false }), { servers: [server], meta })
  assert.deepEqual(calls, [{ official: false }])
})

test(`gets database-backed server filter options`, async () => {
  setServerApi({ filterOptions: async () => result({ regions: [`EU`, `NA`], gameModes: [`FFA`, `TO`] }) })
  const { getServerFilterOptions } = await import('./gameServersApi')

  assert.deepEqual(await getServerFilterOptions(), { regions: [`EU`, `NA`], gameModes: [`FFA`, `TO`] })
})

test(`rejects malformed server page metadata`, async () => {
  setServerApi({
    list: async () => result({ servers: [server], meta: { ...meta, pageSize: 200 } })
  })
  const { getServers } = await import('./gameServersApi')

  await assert.rejects(() => getServers(), /Invalid server page metadata\./u)
})

test(`gets every filtered server page without accepting a starting page`, async () => {
  const calls: unknown[] = []
  const firstPage: GameServerListPage = {
    servers: [server],
    meta: { ...meta, totalPages: 2, totalResults: 101, hasNext: true }
  }
  const second = { ...server, id: 8, externalId: `lobby-8` }
  const secondPage: GameServerListPage = {
    servers: [second],
    meta: { ...meta, currentPage: 2, totalPages: 2, totalResults: 101, hasPrevious: true }
  }
  setServerApi({
    list: async (query = {}) => {
      calls.push(query)
      return result((query.page ?? 1) === 1 ? firstPage : secondPage)
    }
  })
  const { getAllServers } = await import('./gameServersApi')

  assert.deepEqual(await getAllServers({ official: false }), [server, second])
  assert.deepEqual(calls, [
    { official: false, page: 1 },
    { official: false, page: 2 }
  ])
})

test(`gets one singular server profile`, async () => {
  const profile: GameServerProfile = {
    gameServer: { ...server, tornBannerRaw: { LobbyId: `lobby-7` } },
    playerCounts: [{
      id: 1,
      gameServerId: 7,
      playerCount: 20,
      source: `torn_banner`,
      userId: null,
      observedAt: `2026-08-29T10:00:00.000Z`
    }],
    assignment: null,
    variables: [],
    canEditVariables: false
  }
  const ids: number[] = []
  setServerApi({
    get: async (gameServerId) => {
      ids.push(gameServerId)
      return result(profile)
    }
  })
  const { getServer } = await import('./gameServersApi')

  assert.deepEqual(await getServer(7), profile)
  assert.deepEqual(ids, [7])
})

test(`successful server mutations each invalidate reactive server data once`, async () => {
  const calls: string[] = []
  setServerApi({
    update: async () => {
      calls.push(`update`)
      return result(server)
    },
    delete: async () => {
      calls.push(`delete`)
      return result(null, 204)
    },
    restore: async () => {
      calls.push(`restore`)
      return result({ ...server, deletedAt: null })
    }
  })
  const { gameServerRevision } = await import('../stores/gameServersStore')
  const { deleteServer, restoreServer, updateServer } = await import('./gameServersApi')
  const before = get(gameServerRevision)

  assert.equal(await updateServer(server.id, { displayName: `Updated` }), server)
  await deleteServer(server.id)
  await restoreServer(server.id)

  assert.deepEqual(calls, [`update`, `delete`, `restore`])
  assert.equal(get(gameServerRevision), before + 3)
})

test(`successful variable saves invalidate once and failed saves do not invalidate`, async () => {
  const variables = [{
    id: 1,
    gameServerId: server.id,
    label: `Rules URL`,
    key: `rules_url`,
    value: `https://example.test/rules`,
    sortOrder: 3
  }]
  const { gameServerRevision } = await import('../stores/gameServersStore')
  const { updateServerVariables } = await import('./gameServersApi')
  const before = get(gameServerRevision)

  setServerApi({ updateVariables: async () => result(variables) })
  assert.deepEqual(await updateServerVariables(server.id, [{
    label: `Rules URL`,
    value: `https://example.test/rules`,
    sortOrder: 3
  }]), variables)
  assert.equal(get(gameServerRevision), before + 1)

  setServerApi({
    updateVariables: async () => ({
      ok: false,
      status: 403,
      statusText: `Forbidden`,
      data: null,
      error: { code: `FORBIDDEN`, message: `Denied` }
    })
  })
  await assert.rejects(
    () => updateServerVariables(server.id, []),
    /Denied/u
  )
  assert.equal(get(gameServerRevision), before + 1)
})

function setServerApi(gameServers: Partial<ChivServerApi[`gameServers`]>): void {
  Object.defineProperty(globalThis, `window`, {
    configurable: true,
    value: { chivServer: { gameServers } }
  })
}

function result(data: unknown, status = 200): CoreCallResult {
  return {
    ok: true,
    status,
    statusText: `OK`,
    data: status === 204 ? null : { ok: true, data }
  }
}
