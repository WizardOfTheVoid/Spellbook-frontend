import type { IpcMain } from 'electron';
import type { HttpClient } from '../api/http-client';
import type { ServerPlayersPayload } from '../types';
import { parsePlayerListQuery } from '@spellbook/shared/playerListQuery.js'
import { parseGameServerListQuery } from '@spellbook/shared/gameServerListQuery.js'
import { notificationTones, type NotificationTone } from '@spellbook/shared/notifications.js'

type JsonRecord = Record<string, unknown>;

/**
 * Registers IPC handlers for app-server data reads.
 * These requests go to the local server/database layer and intentionally do not touch Core or the game.
 */
export class ServerIpcHandlers {
  constructor(
    private readonly ipcMain: IpcMain,
    private readonly httpClient: HttpClient
  ) {}

  register(): void {
    this.ipcMain.handle(`server:dashboard:get`, async () => {
      return this.httpClient.getServer(`/dashboard`)
    })

    this.ipcMain.handle('server:players:list', async (_event, payload: ServerPlayersPayload) => {
      return this.httpClient.getServer('/players', ServerIpcHandlers.playerQuery(payload));
    });

    this.ipcMain.handle('server:wanted:list', async (_event, payload: ServerPlayersPayload) => {
      return this.httpClient.getServer('/wanted', ServerIpcHandlers.playerQuery(payload))
    })
    this.ipcMain.handle(`server:wanted:get`, async (_event, payload: unknown) => {
      const playerId = ServerIpcHandlers.requiredId(ServerIpcHandlers.record(payload).playerId, `playerId`)
      return this.httpClient.getServer(`/wanted/${playerId}`)
    })
    this.ipcMain.handle(`server:wanted:create`, async (_event, payload: unknown) => {
      const source = ServerIpcHandlers.record(payload)
      if (source.mock !== undefined && typeof source.mock !== `boolean`) throw new Error(`mock must be a boolean.`)
      return this.httpClient.postServer(`/wanted`, {
        playfabId: ServerIpcHandlers.requiredString(source.playfabId, `playfabId`),
        mock: source.mock ?? false
      })
    })
    this.ipcMain.handle(`server:wanted:revert`, async (_event, payload: unknown) => {
      const source = ServerIpcHandlers.record(payload)
      const playerId = ServerIpcHandlers.requiredId(source.playerId, `playerId`)
      return this.httpClient.postServer(`/wanted/${playerId}/revert`, {
        sourceActionId: ServerIpcHandlers.requiredId(source.sourceActionId, `sourceActionId`)
      })
    })
    this.ipcMain.handle(`server:wanted:remove`, async (_event, payload: unknown) => {
      const playerId = ServerIpcHandlers.requiredId(ServerIpcHandlers.record(payload).playerId, `playerId`)
      return this.httpClient.deleteServer(`/wanted/${playerId}`)
    })

    this.ipcMain.handle('server:notifications:list', async (_event, payload: unknown) => {
      const afterId = ServerIpcHandlers.record(payload).afterId
      return this.httpClient.getServer('/notifications', afterId === undefined ? {} : {
        afterId: ServerIpcHandlers.nonNegativeInteger(afterId, 'afterId')
      })
    })
    this.ipcMain.handle('server:notifications:set-read', async (_event, payload: unknown) => {
      const source = ServerIpcHandlers.record(payload)
      const notificationId = ServerIpcHandlers.requiredId(source.notificationId, 'notificationId')
      if (typeof source.read !== 'boolean') throw new Error('read must be a boolean.')
      return this.httpClient.patchServer(`/notifications/${notificationId}/read`, { read: source.read })
    })
    this.ipcMain.handle(`server:notifications:mark-all-read`, async () => {
      return this.httpClient.patchServer(`/notifications/read`, {})
    })
    this.ipcMain.handle('server:notifications:delete', async (_event, payload: unknown) => {
      const notificationId = ServerIpcHandlers.requiredId(ServerIpcHandlers.record(payload).notificationId, 'notificationId')
      return this.httpClient.deleteServer(`/notifications/${notificationId}`)
    })
    this.ipcMain.handle('server:admin:notification-tests:create', async (_event, payload: unknown) => {
      return this.httpClient.postServer(
        `/admin/notification-tests/${ServerIpcHandlers.notificationTone(ServerIpcHandlers.record(payload).tone)}`,
        {}
      )
    })

    this.ipcMain.handle('server:profile-owners:list', async () => this.httpClient.getServer('/profile-owners'));
    this.ipcMain.handle('server:admin:users:list', async (_event, payload: unknown) => {
      const source = ServerIpcHandlers.record(payload);
      return this.httpClient.getServer('/users', {
        limit: ServerIpcHandlers.normalizeInteger(source.limit, 200, 1, 200),
        offset: ServerIpcHandlers.normalizeInteger(source.offset, 0, 0, Number.MAX_SAFE_INTEGER)
      });
    });
    this.ipcMain.handle(`server:admin:audit-logs:list`, async (_event, payload: unknown) => {
      return this.httpClient.getServer(`/admin/audit-logs`, ServerIpcHandlers.auditLogQuery(payload))
    })
    this.ipcMain.handle('server:admin:users:get', async (_event, payload: unknown) => {
      const userId = ServerIpcHandlers.requiredId(ServerIpcHandlers.record(payload).userId, 'userId');
      return this.httpClient.getServer(`/users/${userId}`);
    });
    this.ipcMain.handle(`server:admin:users:wanted-permission`, async (_event, payload: unknown) => {
      const source = ServerIpcHandlers.record(payload)
      const userId = ServerIpcHandlers.requiredId(source.userId, `userId`)
      if (typeof source.enabled !== `boolean`) throw new Error(`enabled must be a boolean.`)
      return this.httpClient.patchServer(`/users/${userId}/wanted-permission`, { enabled: source.enabled })
    })
    this.ipcMain.handle(`server:admin:users:account-enabled`, async (_event, payload: unknown) => {
      const source = ServerIpcHandlers.record(payload)
      const userId = ServerIpcHandlers.requiredId(source.userId, `userId`)
      if (typeof source.enabled !== `boolean`) throw new Error(`enabled must be a boolean.`)
      return this.httpClient.patchServer(`/users/${userId}/account-enabled`, { enabled: source.enabled })
    })
    this.ipcMain.handle(`server:admin:teams:list`, async () => this.httpClient.getServer(`/admin/teams`))
    this.ipcMain.handle(`server:admin:teams:members`, async (_event, payload: unknown) => {
      const teamId = ServerIpcHandlers.requiredId(ServerIpcHandlers.record(payload).teamId, `teamId`)
      return this.httpClient.getServer(`/admin/teams/${teamId}/members`)
    })
    this.ipcMain.handle('server:admin:users:ban', async (_event, payload: unknown) => {
      const source = ServerIpcHandlers.record(payload);
      const userId = ServerIpcHandlers.requiredId(source.userId, 'userId');
      const reason = ServerIpcHandlers.requiredString(source.reason, 'reason');
      return this.httpClient.postServer(`/users/${userId}/ban`, { reason });
    });
    this.ipcMain.handle('server:admin:tick-actions:list', async () => {
      return this.httpClient.getServer('/admin/tick-actions')
    })
    this.ipcMain.handle('server:admin:tick-action-logs:list', async (_event, payload: unknown) => {
      const source = ServerIpcHandlers.record(payload)
      const runId = ServerIpcHandlers.requiredId(source.runId, 'runId')
      const afterId = source.afterId === undefined
        ? undefined
        : ServerIpcHandlers.normalizeInteger(source.afterId, 0, 0, Number.MAX_SAFE_INTEGER)
      return this.httpClient.getServer(`/admin/tick-action-runs/${runId}/logs`, { afterId })
    })
    this.ipcMain.handle('server:admin:tick-actions:start', async (_event, payload: unknown) => {
      return this.httpClient.postServer(`/admin/tick-actions/${ServerIpcHandlers.tickAction(payload)}/start`, {})
    })
    this.ipcMain.handle('server:admin:tick-actions:stop', async (_event, payload: unknown) => {
      return this.httpClient.postServer(`/admin/tick-actions/${ServerIpcHandlers.tickAction(payload)}/stop`, {})
    })
    this.ipcMain.handle('server:admin:tick-actions:resume', async (_event, payload: unknown) => {
      return this.httpClient.postServer(`/admin/tick-actions/${ServerIpcHandlers.tickAction(payload)}/resume`, {})
    })
    this.ipcMain.handle(`server:todo`, async () => this.httpClient.getServer(`/users/me/todo`))
    this.ipcMain.handle(`server:teams:directory`, async () => this.httpClient.getServer(`/teams/directory`))
    this.ipcMain.handle(`server:teams:request`, async (_event, payload: unknown) => {
      const teamId = ServerIpcHandlers.requiredId(ServerIpcHandlers.record(payload).teamId, `teamId`)
      return this.httpClient.postServer(`/teams/${teamId}/requests`, {})
    })
    this.ipcMain.handle(`server:teams:requests`, async (_event, payload: unknown) => {
      const teamId = ServerIpcHandlers.requiredId(ServerIpcHandlers.record(payload).teamId, `teamId`)
      return this.httpClient.getServer(`/teams/${teamId}/requests`)
    })
    this.ipcMain.handle(`server:teams:decide-request`, async (_event, payload: unknown) => {
      const input = ServerIpcHandlers.record(payload)
      const teamId = ServerIpcHandlers.requiredId(input.teamId, `teamId`)
      const userId = ServerIpcHandlers.requiredId(input.userId, `userId`)
      return this.httpClient.patchServer(`/teams/${teamId}/requests/${userId}`, { decision: input.decision })
    })
    this.ipcMain.handle('server:teams:list', async () => this.httpClient.getServer('/teams'));
    this.ipcMain.handle('server:teams:create', async (_event, payload: unknown) => {
      return this.httpClient.postServer('/teams', ServerIpcHandlers.record(payload));
    });
    this.ipcMain.handle(`server:teams:delete`, async (_event, payload: unknown) => {
      const teamId = ServerIpcHandlers.requiredId(ServerIpcHandlers.record(payload).teamId, `teamId`)
      return this.httpClient.deleteServer(`/teams/${teamId}`)
    })
    this.ipcMain.handle('server:teams:members', async (_event, payload: unknown) => {
      const teamId = ServerIpcHandlers.requiredId(ServerIpcHandlers.record(payload).teamId, 'teamId');
      return this.httpClient.getServer(`/teams/${teamId}/members`);
    });
    this.ipcMain.handle('server:teams:member-options', async (_event, payload: unknown) => {
      const teamId = ServerIpcHandlers.requiredId(ServerIpcHandlers.record(payload).teamId, 'teamId');
      return this.httpClient.getServer(`/teams/${teamId}/member-options`);
    });
    this.ipcMain.handle('server:teams:add-member', async (_event, payload: unknown) => {
      const source = ServerIpcHandlers.record(payload);
      const teamId = ServerIpcHandlers.requiredId(source.teamId, 'teamId');
      return this.httpClient.postServer(`/teams/${teamId}/members`, { userId: source.userId });
    });
    this.ipcMain.handle('server:teams:remove-member', async (_event, payload: unknown) => {
      const source = ServerIpcHandlers.record(payload);
      const teamId = ServerIpcHandlers.requiredId(source.teamId, 'teamId');
      const userId = ServerIpcHandlers.requiredId(source.userId, 'userId');
      return this.httpClient.deleteServer(`/teams/${teamId}/members/${userId}`);
    });
    this.ipcMain.handle('server:teams:permissions', async (_event, payload: unknown) => {
      const source = ServerIpcHandlers.record(payload);
      const teamId = ServerIpcHandlers.requiredId(source.teamId, 'teamId');
      const userId = ServerIpcHandlers.requiredId(source.userId, 'userId');
      return this.httpClient.patchServer(`/teams/${teamId}/members/${userId}/permissions`, { permissions: source.permissions });
    });
    this.ipcMain.handle(`server:teams:discord`, async (_event, payload: unknown) => {
      const teamId = ServerIpcHandlers.requiredId(ServerIpcHandlers.record(payload).teamId, `teamId`)
      return this.httpClient.getServer(`/teams/${teamId}/discord`)
    })
    this.ipcMain.handle(`server:teams:discord:unlink`, async (_event, payload: unknown) => {
      const teamId = ServerIpcHandlers.requiredId(ServerIpcHandlers.record(payload).teamId, `teamId`)
      return this.httpClient.deleteServer(`/teams/${teamId}/discord`)
    })

    this.ipcMain.handle('server:gameservers:list', async (_event, payload: unknown) => {
      return this.httpClient.getServer(`/gameservers`, ServerIpcHandlers.gameServerQuery(payload))
    });

    this.ipcMain.handle('server:gameservers:filter-options', async () => {
      return this.httpClient.getServer(`/gameservers/filter-options`)
    });

    this.ipcMain.handle(`server:gameservers:get`, async (_event, payload: unknown) => {
      const gameServerId = ServerIpcHandlers.requiredId(ServerIpcHandlers.record(payload).gameServerId, `gameServerId`)
      return this.httpClient.getServer(`/gameserver/${gameServerId}`)
    });

    this.ipcMain.handle('server:gameservers:update', async (_event, payload: unknown) => {
      const source = ServerIpcHandlers.record(payload);
      const gameServerId = ServerIpcHandlers.requiredId(source.gameServerId, 'gameServerId');
      return this.httpClient.patchServer(
        `/gameserver/${gameServerId}`,
        ServerIpcHandlers.gameServerPatch(source.patch)
      );
    });

    this.ipcMain.handle(`server:gameservers:variables:update`, async (_event, payload: unknown) => {
      const source = ServerIpcHandlers.record(payload)
      const gameServerId = ServerIpcHandlers.requiredId(source.gameServerId, `gameServerId`)
      return this.httpClient.putServer(`/gameserver/${gameServerId}/params`, {
        params: ServerIpcHandlers.gameServerVariables(source.params)
      })
    })

    this.ipcMain.handle('server:gameservers:delete', async (_event, payload: unknown) => {
      const gameServerId = ServerIpcHandlers.requiredId(ServerIpcHandlers.record(payload).gameServerId, 'gameServerId');
      return this.httpClient.deleteServer(`/gameserver/${gameServerId}`);
    });

    this.ipcMain.handle('server:gameservers:restore', async (_event, payload: unknown) => {
      const gameServerId = ServerIpcHandlers.requiredId(ServerIpcHandlers.record(payload).gameServerId, 'gameServerId');
      return this.httpClient.postServer(`/gameserver/${gameServerId}/restore`, {});
    });

    this.ipcMain.handle('server:player-actions:list', async (_event, payload: unknown) => {
      const source = ServerIpcHandlers.record(payload)
      const playerId = ServerIpcHandlers.requiredId(source.playerId, 'playerId')
      const actionType = ServerIpcHandlers.optionalString(source.actionType)
      return this.httpClient.getServer(`/player/${playerId}/actions`, {
        limit: ServerIpcHandlers.normalizeInteger(source.limit, 200, 1, 200),
        offset: ServerIpcHandlers.normalizeInteger(source.offset, 0, 0, Number.MAX_SAFE_INTEGER),
        ...(actionType ? { actionType } : {})
      })
    })

    this.ipcMain.handle('server:player-actions:get', async (_event, payload: unknown) => {
      const source = ServerIpcHandlers.record(payload)
      const playerId = ServerIpcHandlers.requiredId(source.playerId, 'playerId')
      const actionId = ServerIpcHandlers.requiredId(source.actionId, 'actionId')
      return this.httpClient.getServer(`/player/${playerId}/actions/${actionId}`)
    })

    this.ipcMain.handle('server:player-actions:unban', async (_event, payload: unknown) => {
      const source = ServerIpcHandlers.record(payload)
      const playerId = ServerIpcHandlers.requiredId(source.playerId, 'playerId')
      const actionId = ServerIpcHandlers.requiredId(source.actionId, 'actionId')
      return this.httpClient.postServer(
        `/player/${playerId}/actions/${actionId}/unban`,
        ServerIpcHandlers.record(source.input)
      )
    })

    this.ipcMain.handle(`server:player-notes:list`, async (_event, payload: unknown) => {
      const source = ServerIpcHandlers.record(payload)
      const playerId = ServerIpcHandlers.requiredId(source.playerId, `playerId`)
      return this.httpClient.getServer(`/player/${playerId}/notes`, {
        limit: ServerIpcHandlers.normalizeInteger(source.limit, 200, 1, 200),
        offset: ServerIpcHandlers.normalizeInteger(source.offset, 0, 0, Number.MAX_SAFE_INTEGER)
      })
    })

    this.ipcMain.handle(`server:player-notes:create`, async (_event, payload: unknown) => {
      const source = ServerIpcHandlers.record(payload)
      const playerId = ServerIpcHandlers.requiredId(source.playerId, `playerId`)
      return this.httpClient.postServer(
        `/player/${playerId}/notes`,
        ServerIpcHandlers.noteCreate(source.input)
      )
    })

    this.ipcMain.handle(`server:player-notes:update`, async (_event, payload: unknown) => {
      const source = ServerIpcHandlers.record(payload)
      const playerId = ServerIpcHandlers.requiredId(source.playerId, `playerId`)
      const noteId = ServerIpcHandlers.requiredId(source.noteId, `noteId`)
      return this.httpClient.patchServer(
        `/player/${playerId}/notes/${noteId}`,
        ServerIpcHandlers.notePatch(source.input)
      )
    })

    this.ipcMain.handle(`server:user-references:list`, async (_event, payload: unknown) => {
      const source = ServerIpcHandlers.record(payload)
      return this.httpClient.getServer(`/users/references`, {
        limit: ServerIpcHandlers.normalizeInteger(source.limit, 200, 1, 200),
        offset: ServerIpcHandlers.normalizeInteger(source.offset, 0, 0, Number.MAX_SAFE_INTEGER)
      })
    })

    this.ipcMain.handle(`server:user-references:get`, async (_event, payload: unknown) => {
      const userId = ServerIpcHandlers.requiredId(ServerIpcHandlers.record(payload).userId, `userId`)
      return this.httpClient.getServer(`/users/references/${userId}`)
    })

    this.ipcMain.handle('server:player:by-playfab', async (_event, payload: unknown) => {
      const playfabId = ServerIpcHandlers.requiredString(ServerIpcHandlers.record(payload).playfabId, 'playfabId');
      return this.httpClient.getServer(`/players/by-playfab/${encodeURIComponent(playfabId)}`);
    });

    this.ipcMain.handle('server:player:refresh-by-playfab', async (_event, payload: unknown) => {
      const playfabId = ServerIpcHandlers.requiredString(ServerIpcHandlers.record(payload).playfabId, 'playfabId')
      return this.httpClient.postServer(`/players/by-playfab/${encodeURIComponent(playfabId)}/refresh`, {})
    })

    this.ipcMain.handle('server:profiles:list', async (_event, payload: unknown) => {
      const owner = ServerIpcHandlers.owner(ServerIpcHandlers.record(payload).owner);
      return this.httpClient.getServer(ServerIpcHandlers.profilePath(owner));
    });

    this.ipcMain.handle('server:profiles:assignments', async () => {
      return this.httpClient.getServer('/server-profiles/assignments');
    });

    this.ipcMain.handle('server:profiles:active', async (_event, payload: unknown) => {
      const source = ServerIpcHandlers.record(payload);
      return this.httpClient.getServer('/server-profiles/active', {
        externalId: ServerIpcHandlers.optionalString(source.externalId)
      });
    });

    this.ipcMain.handle('server:profiles:get', async (_event, payload: unknown) => {
      const source = ServerIpcHandlers.record(payload);
      const owner = ServerIpcHandlers.owner(source.owner);
      const profileId = ServerIpcHandlers.requiredId(source.profileId, 'profileId');
      return this.httpClient.getServer(`${ServerIpcHandlers.profilePath(owner)}/${profileId}`);
    });

    this.ipcMain.handle('server:profiles:create', async (_event, payload: unknown) => {
      const source = ServerIpcHandlers.record(payload);
      const owner = ServerIpcHandlers.owner(source.owner);
      return this.httpClient.postServer(ServerIpcHandlers.profilePath(owner), source.input ?? {});
    });

    this.ipcMain.handle('server:profiles:update', async (_event, payload: unknown) => {
      const source = ServerIpcHandlers.record(payload);
      const owner = ServerIpcHandlers.owner(source.owner);
      const profileId = ServerIpcHandlers.requiredId(source.profileId, 'profileId');
      return this.httpClient.patchServer(`${ServerIpcHandlers.profilePath(owner)}/${profileId}`, source.input ?? {});
    });

    this.ipcMain.handle('server:profiles:delete', async (_event, payload: unknown) => {
      const source = ServerIpcHandlers.record(payload);
      const owner = ServerIpcHandlers.owner(source.owner);
      const profileId = ServerIpcHandlers.requiredId(source.profileId, 'profileId');
      return this.httpClient.deleteServer(`${ServerIpcHandlers.profilePath(owner)}/${profileId}`);
    });

    this.ipcMain.handle('server:player-actions:record-by-playfab', async (_event, payload: unknown) => {
      return this.httpClient.postServer('/player-actions/by-playfab', ServerIpcHandlers.record(payload))
    })

    this.ipcMain.handle('server:player-actions:record-unban-by-playfab', async (_event, payload: unknown) => {
      return this.httpClient.postServer('/player-actions/unban-by-playfab', ServerIpcHandlers.record(payload))
    })
  }

  private static normalizeInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
    if (value === undefined || value === null || value === '') {
      return fallback;
    }

    const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;

    if (!Number.isInteger(parsed)) {
      return fallback;
    }

    return Math.min(Math.max(parsed, minimum), maximum);
  }

  private static playerQuery(value: unknown): Record<string, string | number> {
    const parsed = parsePlayerListQuery(value)
    const query = {
      ...parsed,
      include: parsed.include?.join(','),
      isOnline: ServerIpcHandlers.booleanParam(parsed.isOnline),
      active: ServerIpcHandlers.booleanParam(parsed.active),
      newAccounts: ServerIpcHandlers.booleanParam(parsed.newAccounts),
      banned: ServerIpcHandlers.booleanParam(parsed.banned)
    }

    return Object.fromEntries(Object.entries(query).filter(([, item]) => item !== undefined)) as Record<string, string | number>
  }

  private static gameServerQuery(value: unknown): Record<string, string | number> {
    const source = ServerIpcHandlers.record(value)
    const parsed = parseGameServerListQuery(value)
    const query: Record<string, string | number> = {}
    const directKeys = [
      `page`, `search`, `region`, `gameMode`, `minSlots`, `maxSlots`, `minPlayers`, `maxPlayers`, `deleted`, `sortBy`, `sortOrder`
    ] as const

    for (const key of directKeys) {
      const item = parsed[key]
      if (source[key] !== undefined && item !== undefined) query[key] = item
    }
    if (source.official !== undefined) {
      query.official = parsed.official === null ? `unknown` : parsed.official ? `1` : `0`
    }
    if (source.includeMainMenu !== undefined) {
      query.includeMainMenu = parsed.includeMainMenu ? `1` : `0`
    }
    for (const key of [`yours`, `duels`] as const) {
      if (source[key] !== undefined) query[key] = parsed[key] ? `1` : `0`
    }

    return query
  }

  private static booleanParam(value: boolean | undefined): string | undefined {
    return value === undefined ? undefined : value ? '1' : '0'
  }

  private static requiredId(value: unknown, name: string): number {
    const id = typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
        ? Number(value)
        : Number.NaN

    if (!Number.isSafeInteger(id) || id < 1) {
      throw new Error(`${name} must be a positive integer.`)
    }

    return id
  }

  private static auditLogQuery(value: unknown): Record<string, string | number> {
    const source = ServerIpcHandlers.record(value)
    const query: Record<string, string | number> = {}
    for (const key of [`beforeId`, `actorId`, `gameServerId`] as const) {
      if (source[key] !== undefined) query[key] = ServerIpcHandlers.requiredId(source[key], key)
    }
    if (source.limit !== undefined) {
      const limit = ServerIpcHandlers.requiredId(source.limit, `limit`)
      if (limit > 100) throw new Error(`limit must be an integer between 1 and 100.`)
      query.limit = limit
    }
    for (const key of [
      `eventType`, `targetType`, `targetId`, `outcome`, `createdFrom`, `createdTo`
    ] as const) {
      if (source[key] !== undefined) query[key] = ServerIpcHandlers.requiredString(source[key], key)
    }
    return query
  }

  private static nonNegativeInteger(value: unknown, name: string): number {
    const id = typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
        ? Number(value)
        : Number.NaN

    if (!Number.isSafeInteger(id) || id < 0) {
      throw new Error(`${name} must be a non-negative integer.`)
    }

    return id
  }

  private static notificationTone(value: unknown): NotificationTone {
    if (!notificationTones.includes(value as NotificationTone)) {
      throw new Error('tone must be success, error, warning, or custom.')
    }

    return value as NotificationTone
  }

  private static notePatch(value: unknown): JsonRecord {
    const source = ServerIpcHandlers.record(value)
    const patch: JsonRecord = {}
    if (Object.prototype.hasOwnProperty.call(source, `content`)) {
      patch.content = ServerIpcHandlers.requiredString(source.content, `content`)
    }
    if (Object.prototype.hasOwnProperty.call(source, `scope`)) {
      if (source.scope !== `me` && source.scope !== `admins` && source.scope !== `public`) {
        throw new Error(`scope must be me, admins, or public.`)
      }
      patch.scope = source.scope
    }
    if (Object.keys(patch).length === 0) throw new Error(`At least one note field is required.`)
    return patch
  }

  private static noteCreate(value: unknown): JsonRecord {
    const input = ServerIpcHandlers.notePatch(value)
    if (typeof input.content !== `string`) throw new Error(`content is required.`)
    return input
  }

  private static owner(value: unknown): { type: 'user' | 'team'; id: number } {
    const source = ServerIpcHandlers.record(value);
    const type = source.type;

    if (type !== 'user' && type !== 'team') {
      throw new Error('owner.type must be user or team.');
    }

    return { type, id: ServerIpcHandlers.requiredId(source.id, 'owner.id') };
  }

  private static profilePath(owner: { type: 'user' | 'team'; id: number }): string {
    return `/profile-owners/${owner.type}/${owner.id}/server-profiles`;
  }

  private static requiredString(value: unknown, name: string): string {
    const normalized = ServerIpcHandlers.optionalString(value);

    if (!normalized) {
      throw new Error(`${name} is required.`);
    }

    return normalized;
  }

  private static tickAction(value: unknown): 'leaderboard' | 'servers' {
    const action = ServerIpcHandlers.record(value).action

    if (action !== 'leaderboard' && action !== 'servers') {
      throw new Error('action must be leaderboard or servers.')
    }

    return action
  }

  private static optionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  // Only presentation fields cross the bridge; the raw name is the profile-matching key.
  private static gameServerPatch(value: unknown): JsonRecord {
    const source = ServerIpcHandlers.record(value);
    const patch: JsonRecord = {};

    for (const key of ['displayName', 'clanName', 'clanTag']) {
      if (!(key in source)) continue;
      patch[key] = ServerIpcHandlers.optionalString(source[key]) ?? null;
    }

    return patch;
  }

  private static gameServerVariables(value: unknown): JsonRecord[] {
    if (!Array.isArray(value)) throw new Error(`params must be an array.`)

    return value.map((item, index) => {
      if (typeof item !== `object` || item === null || Array.isArray(item)) {
        throw new Error(`params[${index}] must be an object.`)
      }
      const source = item as JsonRecord
      if (typeof source.label !== `string`) throw new Error(`params[${index}].label must be a string.`)
      if (typeof source.value !== `string`) throw new Error(`params[${index}].value must be a string.`)
      if (source.sortOrder !== undefined && !Number.isInteger(source.sortOrder)) {
        throw new Error(`params[${index}].sortOrder must be an integer.`)
      }

      return {
        label: source.label,
        value: source.value,
        ...(source.sortOrder === undefined ? {} : { sortOrder: source.sortOrder })
      }
    })
  }

  private static record(value: unknown): JsonRecord {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return {};
    }

    return value as JsonRecord;
  }
}
