import assert from 'node:assert/strict'
import test from 'node:test'
import { get } from 'svelte/store'
import type { GameServerRecord } from '$lib/core'
import { closeInfinityMenu, infinityMenuState } from '../ui/infinityMenu'

const server: GameServerRecord = {
  id: 7,
  externalId: 'lobby-7',
  name: '[TT] DUEL',
  displayName: 'Templars Duel',
  clanName: 'The Templars',
  clanTag: 'TT',
  region: `EU`,
  mapName: `FFA_Duelyard`,
  gameMode: `FFA`,
  buildId: null,
  host: `127.0.0.1`,
  port: 7777,
  queryPort: 7778,
  pingPort: null,
  serverHostname: null,
  maxPlayers: 40,
  official: false,
  platform: `any`,
  buildVersion: null,
  runTime: null,
  gameServerState: null,
  lastHeartbeat: null,
  lastSeen: `2026-08-29T10:00:00.000Z`,
  deletedAt: null,
  createdAt: `2026-08-01T10:00:00.000Z`
}

test('opens one server menu used by row context and actions', async () => {
  const openServerInfinityMenu = await loadOpenServerInfinityMenu()
  const selected: string[] = []

  openServerInfinityMenu(event(), {
    server,
    busy: false,
    onEdit: () => selected.push('edit'),
    onDelete: () => selected.push('delete'),
    onRestore: () => selected.push('restore')
  })

  const menu = get(infinityMenuState)?.menu
  assert.equal(menu?.name, 'Templars Duel')
  assert.deepEqual(menu?.items.map((item) => item.name), ['Edit', 'Delete'])

  await run(menu?.items[0]?.action)
  await run(menu?.items[1]?.action)
  assert.deepEqual(selected, ['edit', 'delete'])
  closeInfinityMenu()
})

test('offers restore instead of delete for soft-deleted servers', async () => {
  const openServerInfinityMenu = await loadOpenServerInfinityMenu()

  openServerInfinityMenu(event(), {
    server: { ...server, deletedAt: '2026-08-18T12:00:00.000Z' },
    busy: true,
    onEdit: () => {},
    onDelete: () => {},
    onRestore: () => {}
  })

  const items = get(infinityMenuState)?.menu.items
  assert.deepEqual(items?.map((item) => item.name), ['Edit', 'Restore'])
  assert.equal(items?.every((item) => item.disabled), true)
  closeInfinityMenu()
})

function event(): MouseEvent {
  return {
    clientX: 300,
    clientY: 200,
    currentTarget: null,
    preventDefault() {},
    stopPropagation() {}
  } as unknown as MouseEvent
}

async function run(action: unknown): Promise<void> {
  if (typeof action === 'function') await action()
}

async function loadOpenServerInfinityMenu() {
  const modulePath = './serverInfinityMenu'
  const module = await import(modulePath) as Record<string, unknown>
  const open = module.openServerInfinityMenu

  assert.equal(typeof open, 'function', 'server rows should expose one InfinityMenu opener')
  return open as (event: MouseEvent, target: {
    server: GameServerRecord
    busy: boolean
    onEdit: (server: GameServerRecord) => void
    onDelete: (server: GameServerRecord) => void
    onRestore: (server: GameServerRecord) => void
  }) => void
}
