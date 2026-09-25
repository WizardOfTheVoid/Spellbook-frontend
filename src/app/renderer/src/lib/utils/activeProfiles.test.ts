import assert from 'node:assert/strict'
import test from 'node:test'
import type { ActiveServerProfile, ServerProfileGraph } from '$lib/core'
import { authState } from '$lib/auth/user'
import { activeProfileGraphs } from './activeProfiles'
import { createProfileActionMenuItems, createRequestActionMenuItems, loadProfileActionMenu } from './profileActionMenu'

const graph = (id: number, type: `user` | `team`, commandType: `ban` | `unban`): ServerProfileGraph => ({
  profile: { id, owner: { type, id: 7 }, name: `${type} rules`, description: null, isDefault: false },
  servers: [], availableVariables: [],
  actions: [{ id, label: `Same label`, actionDomain: `player`, isEnabled: true, sortOrder: 0, delayMs: 0, iconKey: `ban`, blockOnMissingVariables: false,
    commands: [{ commandType, message: `Configured`, delayMs: 0, sortOrder: 0 }] }],
})

test(`active personal and team actions stay distinct and only personal entries get a faded user marker`, async () => {
  const personal = graph(1, `user`, `ban`)
  const team = graph(2, `team`, `unban`)
  const active: ActiveServerProfile = { source: `assigned`, profile: personal, profiles: [personal, team], gameServer: null, variables: [] }
  const runs: unknown[] = []
  const menu = createProfileActionMenuItems(active, async action => { runs.push(action) })
  assert.deepEqual(activeProfileGraphs(active), [personal, team])
  assert.deepEqual(menu.map(item => [item.name, item.suffixIcon]), [[`Same label`, `fa-user`], [`Same label`, undefined]])
  for (const item of menu) if (typeof item.action === `function`) await item.action()
  assert.deepEqual(runs, [personal.actions[0], team.actions[0]])
  assert.equal(createProfileActionMenuItems(active, async () => {}, { commandType: `unban` }).length, 1)
  assert.equal(createProfileActionMenuItems(active, async () => {}, { excludeUnban: true }).length, 1)
  personal.actions[0].isEnabled = false
  assert.equal(createProfileActionMenuItems(active, async () => {}, { excludeUnban: true }).length, 0)
})

test(`an older server response still resolves its single profile`, () => {
  const personal = graph(1, `user`, `ban`)
  assert.deepEqual(activeProfileGraphs({ source: `assigned`, profile: personal, gameServer: null, variables: [] }), [personal])
  assert.deepEqual(activeProfileGraphs(null), [])
})

test(`groups in-game actions by moderation type and preserves configured execution`, async () => {
  const personal = graph(1, `user`, `ban`)
  personal.actions[0].commands.push({ commandType: `server_message`, message: `Announcement`, delayMs: 0, sortOrder: 1 })
  const team = graph(2, `team`, `unban`)
  team.actions.push({ ...team.actions[0], id: 3, commands: [{ commandType: `kick`, message: `Reason`, delayMs: 0, sortOrder: 0 }] })
  team.actions.push({ ...team.actions[0], id: 4, commands: [{ commandType: `incremental_ban`, message: `Reason`, delayMs: 0, sortOrder: 0 }] })
  const active: ActiveServerProfile = { source: `assigned`, profile: personal, profiles: [personal, team], gameServer: null, variables: [] }
  const runs: unknown[] = []
  const menu = createProfileActionMenuItems(active, async action => { runs.push(action) }, { groupByType: true })
  assert.deepEqual(menu.map(item => item.name), [`Ban`, `Kick`, `Unban`])
  assert.equal(menu[0].children?.[0].suffixIcon, `fa-user`)
  assert.equal(menu[0].children?.[0].tooltip, `user rules: 1. ban / 2. server message`)
  for (const group of menu) for (const item of group.children ?? []) {
    if (typeof item.action === `function`) await item.action()
  }
  assert.deepEqual(runs, [personal.actions[0], team.actions[2], team.actions[1], team.actions[0]])
  assert.deepEqual(createProfileActionMenuItems(active, async () => {}, { groupByType: true, excludeUnban: true }).map(item => item.name), [`Ban`, `Kick`])
})


test(`Adminsay-only player actions remain executable in grouped menus`, async () => {
  const personal = graph(1, `user`, `ban`)
  personal.actions[0].commands[0].commandType = `admin_message`
  const active: ActiveServerProfile = { source: `assigned`, profile: personal, gameServer: null, variables: [] }
  const runs: unknown[] = []
  const menu = createProfileActionMenuItems(active, async action => { runs.push(action) }, { groupByType: true })
  assert.equal(menu.length, 1)
  const item = menu[0].children?.[0]
  assert.equal(typeof item?.action, `function`)
  if (typeof item?.action === `function`) await item.action()
  assert.deepEqual(runs, [personal.actions[0]])
})

test(`request actions use the same type order and execute their configured action`, async () => {
  const source = graph(1, `team`, `ban`).actions[0]
  const action = (id: number, commandType: `ban` | `kick` | `unban` | `warn` | `server_message`) => ({
    ...source, id, label: `${commandType} ${id}`,
    commands: [{ commandType, message: `Configured`, delayMs: 0, sortOrder: 0 }],
  })
  const actions = [action(5, `server_message`), action(4, `warn`), action(3, `unban`), action(2, `kick`), action(1, `ban`)]
  const runs: number[] = []
  const activeBan = { id: 9, gameServerId: 7 } as never
  const menu = createRequestActionMenuItems(actions, 7, [activeBan], async chosen => { runs.push(chosen.id!) })
  assert.deepEqual(menu.map(item => item.name), [`Ban`, `Kick`, `Unban`, `Warn`, `Server message`])
  for (const group of menu) for (const item of group.children ?? []) {
    if (typeof item.action === `function`) await item.action()
  }
  assert.deepEqual(runs, [1, 2, 3, 4, 5])
})

test(`request menu puts standalone unban inside the selected server`, async t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, `window`)
  const ban = graph(1, `team`, `ban`).actions[0]
  const kick = { ...ban, id: 2, commands: [{ commandType: `kick` as const, message: `Reason`, delayMs: 0, sortOrder: 0 }] }
  Object.defineProperty(globalThis, `window`, { configurable: true, value: {
    chivCore: { currentGameSnapshot: async () => null },
    chivServer: { actions: async (operation: string) => ({ ok: true, status: 200, data: operation === `offenses`
      ? { actions: [], activeBans: [] }
      : [{ gameServerId: 7, name: `Duel`, profileId: 1, actions: [kick, ban] }] }) },
  } })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, `window`, previous)
    else Reflect.deleteProperty(globalThis, `window`)
  })
  const menu = await loadProfileActionMenu({ playerId: 42, playfabId: `PLAYER`, name: `Player`, gameServerId: 7 }, { groupByType: true })
  assert.deepEqual(menu.map(item => item.name), [`Ban`, `Kick`, `Unban without offense`])
})

test(`each request server has its own standalone unban while offense unbans stay player-level`, async t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, `window`)
  const requests: { operation: string, input: unknown }[] = []
  const ban = { id: 9, actionType: `ban`, offenseType: `low_level`, gameServerId: 7 } as never
  Object.defineProperty(globalThis, `window`, { configurable: true, value: {
    chivCore: { currentGameSnapshot: async () => null },
    chivServer: { actions: async (operation: string, input: unknown) => {
      requests.push({ operation, input })
      return { ok: true, status: 200, data: operation === `offenses`
        ? { actions: [ban], activeBans: [ban] }
        : operation === `options`
          ? [{ gameServerId: 7, name: `KRT Duel Server`, profileId: 1, actions: [] },
            { gameServerId: 8, name: `TT Duel Server`, profileId: 2, actions: [] }]
          : {} }
    } },
  } })
  authState.set({ loading: false, user: { id: 7 } as never })
  t.after(() => {
    authState.set({ loading: true, user: null })
    if (previous) Object.defineProperty(globalThis, `window`, previous)
    else Reflect.deleteProperty(globalThis, `window`)
  })
  const menu = await loadProfileActionMenu({ playerId: 42, playfabId: `PLAYER`, name: `Player` }, { groupByType: true })
  assert.deepEqual(menu.map(item => item.name), [`KRT Duel Server`, `TT Duel Server`, `Unban`, `Remove offense`])
  const unban = menu.find(item => item.name === `Unban`)
  assert.deepEqual(unban?.children?.map(item => item.name), [`Low Level · #7`])
  assert.deepEqual(menu[0]!.children!.map(item => item.name), [`Unban without offense`])
  assert.deepEqual(menu[1]!.children!.map(item => item.name), [`Unban without offense`])
  assert.equal(requests.length, 2)
  const chosen = menu[1]!.children![0]!.action
  if (typeof chosen === `function`) await chosen()
  assert.equal(requests.length, 3)
  assert.equal(requests[2]!.operation, `unbanRequest`)
  assert.equal((requests[2]!.input as { gameServerId: number }).gameServerId, 8)
})
