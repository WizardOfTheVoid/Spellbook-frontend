import assert from 'node:assert/strict'
import test from 'node:test'
import type { IpcMain } from 'electron'
import type { HttpClient } from '../api/http-client'
import { ServerIpcHandlers } from './server-ipc-handlers'

test(`maps the Dashboard read without renderer-supplied scope`, async () => {
  const handlers = new Map<string, (_event: unknown, payload?: unknown) => unknown>()
  const calls: unknown[] = []
  const ipcMain = {
    handle: (channel: string, handler: (_event: unknown, payload?: unknown) => unknown) => handlers.set(channel, handler)
  } as unknown as IpcMain
  const httpClient = {
    getServer: async (path: string) => { calls.push({ method: `GET`, path }) }
  } as unknown as HttpClient
  new ServerIpcHandlers(ipcMain, httpClient).register()

  await handlers.get(`server:dashboard:get`)?.({})

  assert.deepEqual(calls, [{ method: `GET`, path: `/dashboard` }])
})

test(`maps Discord team state and unlink to the selected team`, async () => {
  const handlers = new Map<string, (_event: unknown, payload?: unknown) => unknown>()
  const calls: unknown[] = []
  const ipcMain = {
    handle: (channel: string, handler: (_event: unknown, payload?: unknown) => unknown) => {
      handlers.set(channel, handler)
    }
  } as unknown as IpcMain
  const httpClient = {
    getServer: async (path: string) => { calls.push({ method: `GET`, path }) },
    deleteServer: async (path: string) => { calls.push({ method: `DELETE`, path }) }
  } as unknown as HttpClient
  new ServerIpcHandlers(ipcMain, httpClient).register()

  await handlers.get(`server:teams:discord`)?.({}, { teamId: 8 })
  await handlers.get(`server:teams:discord:unlink`)?.({}, { teamId: 8 })

  assert.deepEqual(calls, [
    { method: `GET`, path: `/teams/8/discord` },
    { method: `DELETE`, path: `/teams/8/discord` }
  ])
})

test(`maps team deletion to the exact server route and returns backend failures`, async () => {
  const handlers = new Map<string, (_event: unknown, payload?: unknown) => unknown>()
  const backendFailure = { ok: false, status: 403, statusText: `Forbidden`, data: null }
  const calls: string[] = []
  const ipcMain = {
    handle: (channel: string, handler: (_event: unknown, payload?: unknown) => unknown) => handlers.set(channel, handler)
  } as unknown as IpcMain
  const httpClient = {
    deleteServer: async (path: string) => {
      calls.push(path)
      return backendFailure
    }
  } as unknown as HttpClient
  new ServerIpcHandlers(ipcMain, httpClient).register()

  const result = await handlers.get(`server:teams:delete`)?.({}, { teamId: 8 })

  assert.deepEqual(calls, [`/teams/8`])
  assert.equal(result, backendFailure)
})

test(`rejects invalid team deletion ids before issuing a request`, async () => {
  const handlers = new Map<string, (_event: unknown, payload?: unknown) => unknown>()
  let calls = 0
  const ipcMain = {
    handle: (channel: string, handler: (_event: unknown, payload?: unknown) => unknown) => handlers.set(channel, handler)
  } as unknown as IpcMain
  const httpClient = {
    deleteServer: async () => {
      calls += 1
      return { ok: true }
    }
  } as unknown as HttpClient
  new ServerIpcHandlers(ipcMain, httpClient).register()

  for (const teamId of [undefined, 0, -1, 1.5, `invalid`]) {
    await assert.rejects(
      () => handlers.get(`server:teams:delete`)?.({}, { teamId }) as Promise<unknown>,
      /teamId must be a positive integer\./
    )
  }
  assert.equal(calls, 0)
})

test(`maps admin Wanted permission and team reads to exact server routes`, async () => {
  const handlers = new Map<string, (_event: unknown, payload?: unknown) => unknown>()
  const calls: unknown[] = []
  const ipcMain = {
    handle: (channel: string, handler: (_event: unknown, payload?: unknown) => unknown) => handlers.set(channel, handler)
  } as unknown as IpcMain
  const httpClient = {
    getServer: async (path: string) => { calls.push([`GET`, path]); return { ok: true } },
    patchServer: async (path: string, body: unknown) => { calls.push([`PATCH`, path, body]); return { ok: true } }
  } as unknown as HttpClient
  new ServerIpcHandlers(ipcMain, httpClient).register()

  await handlers.get(`server:admin:users:wanted-permission`)?.({}, { userId: 7, enabled: false })
  await handlers.get(`server:admin:users:account-enabled`)?.({}, { userId: 7, enabled: true })
  await handlers.get(`server:admin:teams:list`)?.({})
  await handlers.get(`server:admin:teams:members`)?.({}, { teamId: 3 })

  assert.deepEqual(calls, [
    [`PATCH`, `/users/7/wanted-permission`, { enabled: false }],
    [`PATCH`, `/users/7/account-enabled`, { enabled: true }],
    [`GET`, `/admin/teams`],
    [`GET`, `/admin/teams/3/members`]
  ])
  await assert.rejects(
    () => handlers.get(`server:admin:users:wanted-permission`)?.({}, { userId: 7, enabled: `false` }) as Promise<unknown>
  )
  await assert.rejects(
    () => handlers.get(`server:admin:users:account-enabled`)?.({}, { userId: 7, enabled: `true` }) as Promise<unknown>
  )
})

test('maps notification IPC controls to the exact server API routes', async () => {
  const handlers = new Map<string, (_event: unknown, payload?: unknown) => unknown>()
  const calls: unknown[] = []
  const ipcMain = {
    handle: (channel: string, handler: (_event: unknown, payload?: unknown) => unknown) => {
      handlers.set(channel, handler)
    }
  } as unknown as IpcMain
  const httpClient = {
    getServer: async (path: string, query?: unknown) => {
      calls.push({ method: 'GET', path, ...(query ? { query } : {}) })
      return { ok: true }
    },
    patchServer: async (path: string, body: unknown) => {
      calls.push({ method: 'PATCH', path, body })
      return { ok: true }
    },
    deleteServer: async (path: string) => {
      calls.push({ method: 'DELETE', path })
      return { ok: true }
    },
    postServer: async (path: string, body: unknown) => {
      calls.push({ method: 'POST', path, body })
      return { ok: true }
    }
  } as unknown as HttpClient
  new ServerIpcHandlers(ipcMain, httpClient).register()

  await handlers.get('server:notifications:list')?.({}, { afterId: 12 })
  await handlers.get('server:notifications:set-read')?.({}, { notificationId: 7, read: true })
  await handlers.get(`server:notifications:mark-all-read`)?.({}, undefined)
  await handlers.get('server:notifications:delete')?.({}, { notificationId: 7 })
  await handlers.get('server:admin:notification-tests:create')?.({}, { tone: 'warning' })

  assert.deepEqual(calls, [
    { method: 'GET', path: '/notifications', query: { afterId: 12 } },
    { method: 'PATCH', path: '/notifications/7/read', body: { read: true } },
    { method: `PATCH`, path: `/notifications/read`, body: {} },
    { method: 'DELETE', path: '/notifications/7' },
    { method: 'POST', path: '/admin/notification-tests/warning', body: {} }
  ])
})

test('rejects invalid notification ids and test tones before issuing requests', async () => {
  const handlers = new Map<string, (_event: unknown, payload?: unknown) => unknown>()
  let calls = 0
  const ipcMain = {
    handle: (channel: string, handler: (_event: unknown, payload?: unknown) => unknown) => {
      handlers.set(channel, handler)
    }
  } as unknown as IpcMain
  const httpClient = {
    getServer: async () => {
      calls += 1
      return { ok: true }
    },
    patchServer: async () => {
      calls += 1
      return { ok: true }
    },
    deleteServer: async () => {
      calls += 1
      return { ok: true }
    },
    postServer: async () => {
      calls += 1
      return { ok: true }
    }
  } as unknown as HttpClient
  new ServerIpcHandlers(ipcMain, httpClient).register()

  for (const notificationId of [undefined, 0, -1, 1.5, 'invalid']) {
    await assert.rejects(
      () => handlers.get('server:notifications:set-read')?.({}, { notificationId, read: true }) as Promise<unknown>,
      /notificationId must be a positive integer\./
    )
    await assert.rejects(
      () => handlers.get('server:notifications:delete')?.({}, { notificationId }) as Promise<unknown>,
      /notificationId must be a positive integer\./
    )
  }
  for (const tone of [undefined, 'info', 'WARNING', 3]) {
    await assert.rejects(
      () => handlers.get('server:admin:notification-tests:create')?.({}, { tone }) as Promise<unknown>,
      /tone must be success, error, warning, or custom\./
    )
  }
  assert.equal(calls, 0)
})

test('maps one validated player query onto the server API', async () => {
  const handlers = new Map<string, (_event: unknown, payload?: unknown) => unknown>()
  const calls: unknown[] = []
  const ipcMain = {
    handle: (channel: string, handler: (_event: unknown, payload?: unknown) => unknown) => {
      handlers.set(channel, handler)
    }
  } as unknown as IpcMain
  const httpClient = {
    getServer: async (path: string, query?: unknown) => {
      calls.push({ method: 'GET', path, query })
      return { ok: true }
    }
  } as unknown as HttpClient
  new ServerIpcHandlers(ipcMain, httpClient).register()

  await handlers.get('server:players:list')?.({}, {
    page: 2,
    include: ['P1', 'P2', 'P1'],
    search: ' MAGIC ',
    active: true,
    maxRank: 100,
    minPlaytimeHours: 100,
    maxPlaytimeHours: 10000,
    newAccounts: true,
    banned: true,
    sortBy: 'rank',
    sortOrder: 'asc'
  })

  assert.deepEqual(calls, [{
    method: 'GET',
    path: '/players',
    query: {
      page: 2,
      include: 'P1,P2',
      search: 'MAGIC',
      active: '1',
      maxRank: 100,
      minPlaytimeHours: 100,
      maxPlaytimeHours: 10000,
      newAccounts: '1',
      banned: '1',
      sortBy: 'rank',
      sortOrder: 'asc'
    }
  }])
  await assert.rejects(() => handlers.get('server:players:list')?.({}, { page: 0 }) as Promise<unknown>)
})

test(`maps validated server list and singular reads onto the server API`, async () => {
  const handlers = new Map<string, (_event: unknown, payload?: unknown) => unknown>()
  const calls: unknown[] = []
  const ipcMain = {
    handle: (channel: string, handler: (_event: unknown, payload?: unknown) => unknown) => {
      handlers.set(channel, handler)
    }
  } as unknown as IpcMain
  const httpClient = {
    getServer: async (path: string, query?: unknown) => {
      calls.push({ method: `GET`, path, ...(query && Object.keys(query as object).length > 0 ? { query } : {}) })
      return { ok: true }
    }
  } as unknown as HttpClient
  new ServerIpcHandlers(ipcMain, httpClient).register()

  await handlers.get(`server:gameservers:list`)?.({}, {
    page: 2,
    search: ` Duel `,
    official: false,
    minSlots: 20,
    maxSlots: 64,
	minPlayers: 2,
	maxPlayers: 40,
	duels: true,
	yours: true,
	includeMainMenu: false,
    deleted: `all`,
    sortBy: `players`,
    sortOrder: `asc`
  })
  await handlers.get(`server:gameservers:list`)?.({}, { official: null })
  await handlers.get(`server:gameservers:filter-options`)?.({})
  await handlers.get(`server:gameservers:get`)?.({}, { gameServerId: 7 })

  assert.deepEqual(calls, [
    {
      method: `GET`,
      path: `/gameservers`,
      query: {
        page: 2,
        search: `Duel`,
        official: `0`,
        minSlots: 20,
        maxSlots: 64,
		minPlayers: 2,
		maxPlayers: 40,
		duels: `1`,
		yours: `1`,
		includeMainMenu: `0`,
        deleted: `all`,
        sortBy: `players`,
        sortOrder: `asc`
      }
    },
    { method: `GET`, path: `/gameservers`, query: { official: `unknown` } },
	{ method: `GET`, path: `/gameservers/filter-options` },
    { method: `GET`, path: `/gameserver/7` }
  ])

  await assert.rejects(
    () => handlers.get(`server:gameservers:list`)?.({}, { minSlots: 65, maxSlots: 64 }) as Promise<unknown>
  )
  assert.equal(calls.length, 4)
})

test(`sanitizes game server variable updates before PUT`, async () => {
  const handlers = new Map<string, (_event: unknown, payload?: unknown) => unknown>()
  const calls: unknown[] = []
  const ipcMain = {
    handle: (channel: string, handler: (_event: unknown, payload?: unknown) => unknown) => {
      handlers.set(channel, handler)
    }
  } as unknown as IpcMain
  const httpClient = {
    putServer: async (path: string, body: unknown) => {
      calls.push({ method: `PUT`, path, body })
      return { ok: true }
    }
  } as unknown as HttpClient
  new ServerIpcHandlers(ipcMain, httpClient).register()
  const update = handlers.get(`server:gameservers:variables:update`)

  await update?.({}, {
    gameServerId: 7,
    params: [{
      label: `Rules URL`,
      value: `https://example.test/rules`,
      sortOrder: 3,
      key: `injected`,
      gameServerId: 99
    }]
  })

  assert.deepEqual(calls, [{
    method: `PUT`,
    path: `/gameserver/7/params`,
    body: { params: [{ label: `Rules URL`, value: `https://example.test/rules`, sortOrder: 3 }] }
  }])

  const invalid = [
    { gameServerId: 0, params: [] },
    { gameServerId: 7, params: {} },
    { gameServerId: 7, params: [null] },
    { gameServerId: 7, params: [{ label: 3, value: `` }] },
    { gameServerId: 7, params: [{ label: `Rules`, value: 3 }] },
    { gameServerId: 7, params: [{ label: `Rules`, value: ``, sortOrder: 1.5 }] }
  ]
  for (const payload of invalid) {
    await assert.rejects(() => update?.({}, payload) as Promise<unknown>)
  }
  assert.equal(calls.length, 1)
})

test('maps tick action IPC controls to the admin server routes', async () => {
  const handlers = new Map<string, (_event: unknown, payload?: unknown) => unknown>()
  const calls: unknown[] = []
  const ipcMain = {
    handle: (channel: string, handler: (_event: unknown, payload?: unknown) => unknown) => {
      handlers.set(channel, handler)
    }
  } as unknown as IpcMain
  const httpClient = {
    getServer: async (path: string, query?: unknown) => {
      calls.push({ method: 'GET', path, ...(query ? { query } : {}) })
      return { ok: true }
    },
    postServer: async (path: string, body: unknown) => {
      calls.push({ method: 'POST', path, body })
      return { ok: true }
    }
  } as unknown as HttpClient
  new ServerIpcHandlers(ipcMain, httpClient).register()

  await handlers.get('server:admin:tick-actions:list')?.({})
  await handlers.get('server:admin:tick-actions:start')?.({}, { action: 'leaderboard' })
  await handlers.get('server:admin:tick-actions:stop')?.({}, { action: 'leaderboard' })
  await handlers.get('server:admin:tick-actions:resume')?.({}, { action: 'leaderboard' })
  await handlers.get('server:admin:tick-action-logs:list')?.({}, { runId: 12, afterId: 30 })

  assert.deepEqual(calls, [
    { method: 'GET', path: '/admin/tick-actions' },
    { method: 'POST', path: '/admin/tick-actions/leaderboard/start', body: {} },
    { method: 'POST', path: '/admin/tick-actions/leaderboard/stop', body: {} },
    { method: 'POST', path: '/admin/tick-actions/leaderboard/resume', body: {} },
    { method: 'GET', path: '/admin/tick-action-runs/12/logs', query: { afterId: 30 } }
  ])
})

test('maps cached and forced player profile IPC calls separately', async () => {
  const handlers = new Map<string, (_event: unknown, payload?: unknown) => unknown>()
  const calls: unknown[] = []
  const ipcMain = {
    handle: (channel: string, handler: (_event: unknown, payload?: unknown) => unknown) => {
      handlers.set(channel, handler)
    }
  } as unknown as IpcMain
  const httpClient = {
    getServer: async (path: string) => {
      calls.push({ method: 'GET', path })
      return { ok: true }
    },
    postServer: async (path: string, body: unknown) => {
      calls.push({ method: 'POST', path, body })
      return { ok: true }
    }
  } as unknown as HttpClient
  new ServerIpcHandlers(ipcMain, httpClient).register()

  await handlers.get('server:player:by-playfab')?.({}, { playfabId: 'P300' })
  await handlers.get('server:player:refresh-by-playfab')?.({}, { playfabId: 'P300' })

  assert.deepEqual(calls, [
    { method: 'GET', path: '/players/by-playfab/P300' },
    { method: 'POST', path: '/players/by-playfab/P300/refresh', body: {} }
  ])
})

test('maps the complete player query onto the Wanted server API', async () => {
  const handlers = new Map<string, (_event: unknown, payload?: unknown) => unknown>()
  const calls: unknown[] = []
  const ipcMain = {
    handle: (channel: string, handler: (_event: unknown, payload?: unknown) => unknown) => {
      handlers.set(channel, handler)
    }
  } as unknown as IpcMain
  const httpClient = {
    getServer: async (path: string, query?: unknown) => {
      calls.push({ method: 'GET', path, query })
      return { ok: true }
    }
  } as unknown as HttpClient
  new ServerIpcHandlers(ipcMain, httpClient).register()

  await handlers.get('server:wanted:list')?.({}, {
    page: 3,
    include: ['P1', 'P2'],
    search: ' MAGIC ',
    isOnline: false,
    active: true,
    minRank: 10,
    maxRank: 100,
    minOffenses: 2,
    minPlaytimeHours: 5,
    maxPlaytimeHours: 500,
    newAccounts: false,
    banned: true,
    sortBy: 'accountCreated',
    sortOrder: 'desc',
    createdAfter: '2026-01-01',
    createdBefore: '2026-08-26'
  })

  assert.deepEqual(calls, [{
    method: 'GET',
    path: '/wanted',
    query: {
      page: 3,
      include: 'P1,P2',
      search: 'MAGIC',
      isOnline: '0',
      active: '1',
      minRank: 10,
      maxRank: 100,
      minOffenses: 2,
      minPlaytimeHours: 5,
      maxPlaytimeHours: 500,
      newAccounts: '0',
      banned: '1',
      sortBy: 'accountCreated',
      sortOrder: 'desc',
      createdAfter: '2026-01-01',
      createdBefore: '2026-08-26'
    }
  }])
})

test('maps player action and related unban channels onto the server API', async () => {
  const handlers = new Map<string, (_event: unknown, payload?: unknown) => unknown>()
  const calls: unknown[] = []
  const ipcMain = {
    handle: (channel: string, handler: (_event: unknown, payload?: unknown) => unknown) => {
      handlers.set(channel, handler)
    }
  } as unknown as IpcMain
  const httpClient = {
    getServer: async (path: string, query?: unknown) => {
      calls.push({ method: 'GET', path, ...(query ? { query } : {}) })
      return { ok: true }
    },
    postServer: async (path: string, body: unknown) => {
      calls.push({ method: 'POST', path, body })
      return { ok: true }
    }
  } as unknown as HttpClient
  new ServerIpcHandlers(ipcMain, httpClient).register()

  await handlers.get('server:player-actions:list')?.({}, {
    playerId: 42,
    limit: '50',
    offset: '200',
    actionType: 'ban'
  })
  await handlers.get('server:player-actions:get')?.({}, { playerId: 42, actionId: 9 })
  await handlers.get('server:player-actions:unban')?.({}, {
    playerId: 42,
    actionId: 9,
    input: { gameServerId: 3, reason: 'Manual review' }
  })
  assert.deepEqual(calls, [
    { method: 'GET', path: '/player/42/actions', query: { limit: 50, offset: 200, actionType: 'ban' } },
    { method: 'GET', path: '/player/42/actions/9' },
    { method: 'POST', path: '/player/42/actions/9/unban', body: { gameServerId: 3, reason: 'Manual review' } }
  ])
})

test(`maps player-owned notes and user references onto the server API`, async () => {
  const handlers = new Map<string, (_event: unknown, payload?: unknown) => unknown>()
  const calls: unknown[] = []
  const ipcMain = {
    handle: (channel: string, handler: (_event: unknown, payload?: unknown) => unknown) => handlers.set(channel, handler)
  } as unknown as IpcMain
  const httpClient = {
    getServer: async (path: string, query?: unknown) => {
      calls.push({ method: `GET`, path, ...(query ? { query } : {}) })
      return { ok: true }
    },
    postServer: async (path: string, body: unknown) => {
      calls.push({ method: `POST`, path, body })
      return { ok: true }
    },
    patchServer: async (path: string, body: unknown) => {
      calls.push({ method: `PATCH`, path, body })
      return { ok: true }
    },
  } as unknown as HttpClient
  new ServerIpcHandlers(ipcMain, httpClient).register()

  await handlers.get(`server:player-notes:list`)?.({}, { playerId: 42, limit: 200, offset: 0 })
  await handlers.get(`server:player-notes:create`)?.({}, {
    playerId: 42,
    input: { content: `#[action:9] reviewed`, scope: `admins` },
  })
  await handlers.get(`server:player-notes:update`)?.({}, {
    playerId: 42,
    noteId: 3,
    input: { scope: `public` },
  })
  await handlers.get(`server:user-references:list`)?.({}, { limit: 200, offset: 0 })
  await handlers.get(`server:user-references:get`)?.({}, { userId: 7 })

  assert.deepEqual(calls, [
    { method: `GET`, path: `/player/42/notes`, query: { limit: 200, offset: 0 } },
    { method: `POST`, path: `/player/42/notes`, body: { content: `#[action:9] reviewed`, scope: `admins` } },
    { method: `PATCH`, path: `/player/42/notes/3`, body: { scope: `public` } },
    { method: `GET`, path: `/users/references`, query: { limit: 200, offset: 0 } },
    { method: `GET`, path: `/users/references/7` },
  ])
})

test('maps by-PlayFab action and unrelated unban audits without legacy offense aliases', async () => {
  const handlers = new Map<string, (_event: unknown, payload?: unknown) => unknown>()
  const calls: unknown[] = []
  const ipcMain = {
    handle: (channel: string, handler: (_event: unknown, payload?: unknown) => unknown) => {
      handlers.set(channel, handler)
    }
  } as unknown as IpcMain
  const httpClient = {
    postServer: async (path: string, body: unknown) => {
      calls.push({ method: 'POST', path, body })
      return { ok: true }
    }
  } as unknown as HttpClient
  new ServerIpcHandlers(ipcMain, httpClient).register()

  const action = {
    playfabId: 'PLAYER_1',
    playerName: 'Alice',
    gameServerId: 3,
    actionType: 'ban',
    offenseType: 'hacker',
    duration: null,
    reason: 'Evidence',
    scope: 'global'
  }
  const unban = {
    playfabId: 'PLAYER_1',
    playerName: 'Alice',
    gameServerId: 3,
    reason: 'Appeal accepted'
  }

  await handlers.get('server:player-actions:record-by-playfab')?.({}, action)
  await handlers.get('server:player-actions:record-unban-by-playfab')?.({}, unban)

  assert.deepEqual(calls, [
    { method: 'POST', path: '/player-actions/by-playfab', body: action },
    { method: 'POST', path: '/player-actions/unban-by-playfab', body: unban }
  ])
  assert.equal(handlers.has('server:player-offenses:list'), false)
  assert.equal(handlers.has('server:offenses:record-by-playfab'), false)
})

test('rejects invalid player and action ids before issuing player-action requests', async () => {
  const handlers = new Map<string, (_event: unknown, payload?: unknown) => unknown>()
  let calls = 0
  const ipcMain = {
    handle: (channel: string, handler: (_event: unknown, payload?: unknown) => unknown) => {
      handlers.set(channel, handler)
    }
  } as unknown as IpcMain
  const httpClient = {
    getServer: async () => {
      calls += 1
      return { ok: true }
    }
  } as unknown as HttpClient
  new ServerIpcHandlers(ipcMain, httpClient).register()
  const listActions = handlers.get('server:player-actions:list')
  const getAction = handlers.get('server:player-actions:get')

  for (const playerId of [undefined, 0, -1, 1.5, 'invalid']) {
    await assert.rejects(
      () => listActions?.({}, { playerId }) as Promise<unknown>,
      /playerId must be a positive integer\./
    )
  }
  for (const actionId of [undefined, 0, -1, 1.5, 'invalid']) {
    await assert.rejects(
      () => getAction?.({}, { playerId: 42, actionId }) as Promise<unknown>,
      /actionId must be a positive integer\./
    )
  }
  assert.equal(calls, 0)
})

test(`maps Wanted controls and allowlisted audit filters exactly`, async () => {
  const handlers = new Map<string, (_event: unknown, payload?: unknown) => unknown>()
  const calls: unknown[] = []
  const ipcMain = {
    handle: (channel: string, handler: (_event: unknown, payload?: unknown) => unknown) => {
      handlers.set(channel, handler)
    }
  } as unknown as IpcMain
  const httpClient = {
    getServer: async (path: string, query?: unknown) => {
      calls.push({ method: `GET`, path, ...(query ? { query } : {}) })
      return { ok: true }
    },
    postServer: async (path: string, body: unknown) => {
      calls.push({ method: `POST`, path, body })
      return { ok: true }
    },
    patchServer: async (path: string, body: unknown) => {
      calls.push({ method: `PATCH`, path, body })
      return { ok: true }
    },
    deleteServer: async (path: string) => {
      calls.push({ method: `DELETE`, path })
      return { ok: true }
    }
  } as unknown as HttpClient
  new ServerIpcHandlers(ipcMain, httpClient).register()

  await handlers.get(`server:wanted:get`)?.({}, { playerId: 42 })
  await handlers.get(`server:wanted:create`)?.({}, {
    playfabId: `PLAYER_1`,
    mock: true,
    authorId: 999
  })
  await handlers.get(`server:wanted:revert`)?.({}, {
    playerId: 42,
    sourceActionId: 9,
    autoban: true
  })
  await handlers.get(`server:wanted:remove`)?.({}, { playerId: 42 })
  await handlers.get(`server:admin:audit-logs:list`)?.({}, {
    beforeId: 100,
    eventType: `wanted.executed`,
    actorId: 17,
    targetType: `player`,
    targetId: `42`,
    gameServerId: 7,
    outcome: `success`,
    createdFrom: `2026-08-01T00:00:00.000Z`,
    createdTo: `2026-08-31T23:59:59.999Z`,
    limit: 50,
    injected: `discard me`
  })

  assert.deepEqual(calls, [
    { method: `GET`, path: `/wanted/42` },
    {
      method: `POST`,
      path: `/wanted`,
      body: { playfabId: `PLAYER_1`, mock: true }
    },
    { method: `POST`, path: `/wanted/42/revert`, body: { sourceActionId: 9 } },
    { method: `DELETE`, path: `/wanted/42` },
    {
      method: `GET`,
      path: `/admin/audit-logs`,
      query: {
        beforeId: 100,
        eventType: `wanted.executed`,
        actorId: 17,
        targetType: `player`,
        targetId: `42`,
        gameServerId: 7,
        outcome: `success`,
        createdFrom: `2026-08-01T00:00:00.000Z`,
        createdTo: `2026-08-31T23:59:59.999Z`,
        limit: 50
      }
    }
  ])
})

test(`rejects invalid Wanted bridge IDs before any request`, async () => {
  const handlers = new Map<string, (_event: unknown, payload?: unknown) => unknown>()
  let calls = 0
  const ipcMain = {
    handle: (channel: string, handler: (_event: unknown, payload?: unknown) => unknown) => {
      handlers.set(channel, handler)
    }
  } as unknown as IpcMain
  const httpClient = {
    getServer: async () => {
      calls += 1
      return { ok: true }
    },
    postServer: async () => {
      calls += 1
      return { ok: true }
    },
    patchServer: async () => {
      calls += 1
      return { ok: true }
    },
    deleteServer: async () => {
      calls += 1
      return { ok: true }
    }
  } as unknown as HttpClient
  new ServerIpcHandlers(ipcMain, httpClient).register()

  for (const [channel, payload] of [
    [`server:wanted:get`, { playerId: 0 }],
    [`server:wanted:revert`, { playerId: 42, sourceActionId: 0 }],
    [`server:wanted:remove`, { playerId: -1 }],
    [`server:player-notes:update`, { playerId: 42, noteId: 0, input: { scope: `me` } }],
    [`server:admin:audit-logs:list`, { actorId: 0 }]
  ] as const) {
    await assert.rejects(() => handlers.get(channel)?.({}, payload) as Promise<unknown>, /positive integer/)
  }

  await assert.rejects(
    () => handlers.get(`server:wanted:create`)?.({}, { playfabId: ``, mock: false }) as Promise<unknown>,
    /required/
  )

  assert.equal(calls, 0)
})
