import assert from 'node:assert/strict'
import test from 'node:test'
import { get } from 'svelte/store'
import type { GameServerRecord } from '$lib/core'
import { closeInfinityMenu, infinityMenuState, positionInfinityMenu } from '../ui/infinityMenu'

const server: GameServerRecord = {
  geoLatitude: null, geoLongitude: null, geoAccuracyRadiusKm: null, geoCountryCode: null,
  geoCity: null, geoTimezone: null, geoSource: null, geoCheckedAt: null,
  ownerTeamId: null,
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
    isSuperadmin: true,
    busy: false,
    onEdit: () => selected.push('edit'),
    onDelete: () => selected.push('delete'),
    onRestore: () => selected.push('restore')
  })

  const menu = get(infinityMenuState)?.menu
  assert.equal(menu?.name, 'Templars Duel')

  await run(menu?.items[0]?.action)
  await run(menu?.items[1]?.action)
  assert.deepEqual(selected, ['edit', 'delete'])
  closeInfinityMenu()
})

test('offers restore instead of delete for soft-deleted servers', async () => {
  const openServerInfinityMenu = await loadOpenServerInfinityMenu()
  const selected: string[] = []

  openServerInfinityMenu(event(), {
    server: { ...server, deletedAt: '2026-08-18T12:00:00.000Z' },
    isSuperadmin: true,
    busy: false,
    onEdit: () => selected.push(`open`),
    onDelete: () => selected.push(`delete`),
    onRestore: () => selected.push(`restore`)
  })

  const items = get(infinityMenuState)?.menu.items
  await run(items?.[0]?.action)
  await run(items?.[1]?.action)
  assert.deepEqual(selected, [`open`, `restore`])
  closeInfinityMenu()
})

test(`server context menus use the pointer while action clicks anchor the dropdown`, async () => {
  const openServerInfinityMenu = await loadOpenServerInfinityMenu()
  const owner = { getBoundingClientRect: () => ({ left: 80, top: 50, right: 180, bottom: 90, width: 100, height: 40 }) } as HTMLElement
  for (const [type, expected] of [[`contextmenu`, { x: 140, y: 125 }], [`click`, { x: 40, y: 94 }]] as const) {
    openServerInfinityMenu({ ...event(), type, currentTarget: owner, clientX: 140, clientY: 125 } as MouseEvent, {
      server, isSuperadmin: true, busy: false, onEdit: () => {}, onDelete: () => {}, onRestore: () => {},
    })
    const snapshot = get(infinityMenuState)
    assert.ok(snapshot)
    assert.deepEqual(positionInfinityMenu(snapshot, { width: 180, height: 140 }, { width: 500, height: 500 }), expected)
  }
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

test(`ordinary users cannot invoke shared server deletion or restoration from either menu`, async () => {
  const openServerInfinityMenu = await loadOpenServerInfinityMenu()
  for (const type of [`click`, `contextmenu`]) {
    for (const deletedAt of [null, `2026-10-18T00:00:00.000Z`]) {
      const selected: string[] = []
      openServerInfinityMenu({ ...event(), type }, {
        server: { ...server, deletedAt }, isSuperadmin: false, busy: false,
        onEdit: () => selected.push(`open`), onDelete: () => selected.push(`delete`), onRestore: () => selected.push(`restore`)
      })
      for (const item of get(infinityMenuState)?.menu.items ?? []) await run(item.action)
      assert.deepEqual(selected, [`open`])
      closeInfinityMenu()
    }
  }
})

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
    isSuperadmin: boolean
    busy: boolean
    onEdit: (server: GameServerRecord) => void
    onDelete: (server: GameServerRecord) => void
    onRestore: (server: GameServerRecord) => void
  }) => void
}
