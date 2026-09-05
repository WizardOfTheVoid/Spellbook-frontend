import {
  getServerApi,
  type GameServerListPage,
  type GameServerListQueryInput,
  type GameServerFilterOptions,
  type GameServerParam,
  type GameServerPatch,
  type GameServerProfile,
  type GameServerRecord,
  type ServerVariableInput
} from '$lib/core'
import { gameServerChanged } from '$lib/stores/gameServersStore'
import { unwrap } from './apiResult'
import { getBooleanField, getNumberField, getRecordField, isRecord } from './records'

export async function getServer(gameServerId: number): Promise<GameServerProfile> {
  return unwrap<GameServerProfile>(
    await getServerApi().gameServers.get(gameServerId),
    `Game server request failed.`
  )
}

export async function getServerFilterOptions(): Promise<GameServerFilterOptions> {
  const value = await unwrap<unknown>(
    await getServerApi().gameServers.filterOptions(),
    `Server filter options request failed.`
  )
  if (!isRecord(value) || !Array.isArray(value.regions) || !Array.isArray(value.gameModes)) {
    throw new Error(`Invalid server filter options.`)
  }
  const strings = (items: unknown[]) => items.map(item => {
    if (typeof item !== `string` || !item.trim()) throw new Error(`Invalid server filter options.`)
    return item
  })
  return { regions: strings(value.regions), gameModes: strings(value.gameModes) }
}

export async function getServers(query: GameServerListQueryInput = {}): Promise<GameServerListPage> {
  const data = await unwrap<unknown>(
    await getServerApi().gameServers.list(query),
    `Game server request failed.`
  )
  return parseGameServerPage(data)
}

export async function getAllServers(
  query: Omit<GameServerListQueryInput, `page`> = {}
): Promise<GameServerRecord[]> {
  const first = await getServers({ ...query, page: 1 })
  const servers = [...first.servers]

  for (let page = 2; page <= first.meta.totalPages; page += 1) {
    servers.push(...(await getServers({ ...query, page })).servers)
  }

  return servers
}

export async function updateServer(gameServerId: number, patch: GameServerPatch): Promise<GameServerRecord> {
  const server = await unwrap<GameServerRecord>(
    await getServerApi().gameServers.update(gameServerId, patch),
    `Server save failed.`
  )
  gameServerChanged()
  return server
}

export async function updateServerVariables(
  gameServerId: number,
  variables: ServerVariableInput[]
): Promise<GameServerParam[]> {
  const savedVariables = await unwrap<GameServerParam[]>(
    await getServerApi().gameServers.updateVariables(gameServerId, variables),
    `Server variable save failed.`
  )
  gameServerChanged()
  return savedVariables
}

export async function deleteServer(gameServerId: number): Promise<void> {
  await unwrap<unknown>(await getServerApi().gameServers.delete(gameServerId), `Server delete failed.`)
  gameServerChanged()
}

export async function restoreServer(gameServerId: number): Promise<void> {
  await unwrap<unknown>(await getServerApi().gameServers.restore(gameServerId), `Server restore failed.`)
  gameServerChanged()
}

function parseGameServerPage(value: unknown): GameServerListPage {
  if (!isRecord(value) || !Array.isArray(value.servers)) throw invalidMetadata()
  const meta = getRecordField(value, `meta`)
  const currentPage = integer(meta, `currentPage`, 1)
  const pageSize = integer(meta, `pageSize`, 100)
  const totalPages = integer(meta, `totalPages`, 0)
  const totalResults = integer(meta, `totalResults`, 0)
  const hasPrevious = getBooleanField(meta, `hasPrevious`)
  const hasNext = getBooleanField(meta, `hasNext`)

  if (
    pageSize !== 100
    || totalPages !== Math.ceil(totalResults / pageSize)
    || hasPrevious !== currentPage > 1
    || hasNext !== currentPage < totalPages
  ) throw invalidMetadata()

  return {
    servers: value.servers.slice(0, 100) as GameServerRecord[],
    meta: { currentPage, pageSize, totalPages, totalResults, hasPrevious, hasNext }
  }
}

function integer(source: Record<string, unknown> | null, key: string, minimum: number): number {
  const value = getNumberField(source, key)
  if (value === null || !Number.isInteger(value) || value < minimum) throw invalidMetadata()
  return value
}

function invalidMetadata(): Error {
  return new Error(`Invalid server page metadata.`)
}
