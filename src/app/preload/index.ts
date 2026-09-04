import { contextBridge, ipcRenderer } from 'electron';
import type { GameServerListQueryInput } from '@spellbook/shared/gameServerListQuery.js'
import type { NotificationTone } from '@spellbook/shared/notifications.js'
import { createRuntimeCoreBridge, type RuntimeIpcRenderer } from './coreBridge'
import { createDiscordInstallBridge, type DiscordInstallIpcRenderer } from './discordInstallBridge'
import { createDashboardBridge } from './dashboardBridge'

type VisibilityListener = (visible: boolean) => void;

type SnapshotLookupEvent = {
  ok: boolean
  hasText: boolean
  text: string
  lines: string[]
  error?: string
}

type ToastRequest = {
  message: string
  level: 'success' | 'error' | 'warning' | 'info'
  durationMs?: number
}

type CoreBatchCommand = {
  commandType: 'server_message' | 'warn' | 'kick' | 'ban' | 'unban'
  message: string
  delayMs: number
  playfabId?: string
  hours?: number
}

type GameServerPatch = {
  displayName?: string | null
  clanName?: string | null
  clanTag?: string | null
}

type ServerVariableInput = {
  label: string
  value: string
  sortOrder?: number
}

type TickAction = 'leaderboard' | 'servers'

type PlayerListQuery = {
  page?: number
  include?: string[]
  search?: string
  isOnline?: boolean
  active?: boolean
  minRank?: number
  maxRank?: number
  minOffenses?: number
  minPlaytimeHours?: number
  maxPlaytimeHours?: number
  newAccounts?: boolean
  banned?: boolean
  sortBy?: 'rank' | 'lastSeen' | 'accountCreated'
  sortOrder?: 'asc' | 'desc'
  createdAfter?: string
  createdBefore?: string
}

const chivCore = {
  ...createRuntimeCoreBridge(ipcRenderer as unknown as RuntimeIpcRenderer),
  health: () => ipcRenderer.invoke('core:health'),
  listPlayers: () => ipcRenderer.invoke('core:listPlayers'),
  nativeListPlayers: () => ipcRenderer.invoke('core:nativeListPlayers'),
  snapshot: () => ipcRenderer.invoke('core:snapshot'),
  executeBatch: (commands: CoreBatchCommand[]) => ipcRenderer.invoke('core:commandBatch', { commands }),
  message: (kind: 'admin' | 'server', message: string) => ipcRenderer.invoke('core:message', { kind, message }),
  antiAfkState: () => ipcRenderer.invoke(`core:antiAfkState`),
  setAntiAfkEnabled: (enabled: boolean) => ipcRenderer.invoke(`core:setAntiAfkEnabled`, { enabled }),
  sendCommand: (command: string, expectClipboard = false, restoreClipboard = true) =>
    ipcRenderer.invoke('core:command', { command, expectClipboard, restoreClipboard }),
  kick: (playfabId: string, reason: string) => ipcRenderer.invoke('core:kick', { playfabId, reason }),
  ban: (playfabId: string, hours: number, reason: string) => ipcRenderer.invoke('core:ban', { playfabId, hours, reason }),
  unban: (playfabId: string) => ipcRenderer.invoke('core:unban', { playfabId }),
  warn: (message: string) => ipcRenderer.invoke('core:warn', { message }),
  serverMessage: (message: string) => ipcRenderer.invoke('core:warn', { message })
};

const chivAuth = {
  openHelp: () => ipcRenderer.invoke(`auth:help`),
  login: () => ipcRenderer.invoke('auth:login'),
  session: () => ipcRenderer.invoke('auth:session'),
  updateProfile: (profile: { displayName: string; playfabId: string }) => ipcRenderer.invoke('auth:profile', profile),
  logout: () => ipcRenderer.invoke('auth:logout'),
  onSessionChange: (callback: (result: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, result: unknown) => callback(result);
    ipcRenderer.on('auth:sessionChanged', listener);
    return () => ipcRenderer.removeListener('auth:sessionChanged', listener);
  }
};

const discordInstall = createDiscordInstallBridge(ipcRenderer as unknown as DiscordInstallIpcRenderer)

const chivServer = {
  ...createDashboardBridge(ipcRenderer),
  getPlayers: (query: PlayerListQuery = {}) => ipcRenderer.invoke('server:players:list', query),
  getWantedPlayers: (query: PlayerListQuery = {}) => ipcRenderer.invoke('server:wanted:list', query),
  wanted: {
    get: (playerId: number) => ipcRenderer.invoke(`server:wanted:get`, { playerId }),
    create: (input: unknown) => ipcRenderer.invoke(`server:wanted:create`, input),
    revert: (playerId: number, sourceActionId: number) => ipcRenderer.invoke(`server:wanted:revert`, { playerId, sourceActionId }),
    remove: (playerId: number) => ipcRenderer.invoke(`server:wanted:remove`, { playerId })
  },
  notifications: {
    list: (afterId?: number) => ipcRenderer.invoke('server:notifications:list', { afterId }),
    setRead: (notificationId: number, read: boolean) => ipcRenderer.invoke('server:notifications:set-read', { notificationId, read }),
    markAllRead: () => ipcRenderer.invoke(`server:notifications:mark-all-read`),
    delete: (notificationId: number) => ipcRenderer.invoke('server:notifications:delete', { notificationId })
  },
  profileOwners: () => ipcRenderer.invoke('server:profile-owners:list'),
  admin: {
    auditLogs: {
      list: (query: unknown = {}) => ipcRenderer.invoke(`server:admin:audit-logs:list`, query)
    },
    notificationTests: {
      create: (tone: NotificationTone) => ipcRenderer.invoke('server:admin:notification-tests:create', { tone })
    },
    users: {
      list: (params: { limit?: number; offset?: number } = {}) => ipcRenderer.invoke('server:admin:users:list', params),
      get: (userId: number) => ipcRenderer.invoke('server:admin:users:get', { userId }),
      setWantedPermission: (userId: number, enabled: boolean) =>
        ipcRenderer.invoke(`server:admin:users:wanted-permission`, { userId, enabled }),
      setAccountEnabled: (userId: number, enabled: boolean) =>
        ipcRenderer.invoke(`server:admin:users:account-enabled`, { userId, enabled }),
      ban: (userId: number, reason: string) => ipcRenderer.invoke('server:admin:users:ban', { userId, reason })
    },
    teams: {
      list: () => ipcRenderer.invoke(`server:admin:teams:list`),
      members: (teamId: number) => ipcRenderer.invoke(`server:admin:teams:members`, { teamId })
    },
    tickActions: {
      list: () => ipcRenderer.invoke('server:admin:tick-actions:list'),
      logs: (runId: number, afterId?: number) => ipcRenderer.invoke('server:admin:tick-action-logs:list', { runId, afterId }),
      start: (action: TickAction) => ipcRenderer.invoke('server:admin:tick-actions:start', { action }),
      stop: (action: TickAction) => ipcRenderer.invoke('server:admin:tick-actions:stop', { action }),
      resume: (action: TickAction) => ipcRenderer.invoke('server:admin:tick-actions:resume', { action })
    }
  },
  teams: {
    list: () => ipcRenderer.invoke('server:teams:list'),
    create: (name: string) => ipcRenderer.invoke('server:teams:create', { name }),
    members: (teamId: number) => ipcRenderer.invoke('server:teams:members', { teamId }),
    memberOptions: (teamId: number) => ipcRenderer.invoke('server:teams:member-options', { teamId }),
    addMember: (teamId: number, userId: number) => ipcRenderer.invoke('server:teams:add-member', { teamId, userId }),
    removeMember: (teamId: number, userId: number) => ipcRenderer.invoke('server:teams:remove-member', { teamId, userId }),
    setPermissions: (teamId: number, userId: number, permissions: string[]) => ipcRenderer.invoke('server:teams:permissions', { teamId, userId, permissions }),
    discord: (teamId: number) => ipcRenderer.invoke(`server:teams:discord`, { teamId }),
    installDiscord: (teamId: number) => ipcRenderer.invoke('discord:install', { teamId }),
    unlinkDiscord: (teamId: number) => ipcRenderer.invoke(`server:teams:discord:unlink`, { teamId }),
    onDiscordInstallCompleted: discordInstall.onCompleted
  },
  gameServers: {
    get: (gameServerId: number) => ipcRenderer.invoke(`server:gameservers:get`, { gameServerId }),
    list: (query: GameServerListQueryInput = {}) => ipcRenderer.invoke(`server:gameservers:list`, query),
    filterOptions: () => ipcRenderer.invoke(`server:gameservers:filter-options`),
    update: (gameServerId: number, patch: GameServerPatch) =>
      ipcRenderer.invoke('server:gameservers:update', { gameServerId, patch }),
    updateVariables: (gameServerId: number, params: ServerVariableInput[]) =>
      ipcRenderer.invoke(`server:gameservers:variables:update`, { gameServerId, params }),
    delete: (gameServerId: number) => ipcRenderer.invoke('server:gameservers:delete', { gameServerId }),
    restore: (gameServerId: number) => ipcRenderer.invoke('server:gameservers:restore', { gameServerId })
  },
  playerActions: {
    list: (playerId: number, limit: number, offset: number, actionType?: string) =>
      ipcRenderer.invoke('server:player-actions:list', { playerId, limit, offset, actionType }),
    get: (playerId: number, actionId: number) =>
      ipcRenderer.invoke('server:player-actions:get', { playerId, actionId }),
    unban: (playerId: number, actionId: number, input: unknown) =>
      ipcRenderer.invoke('server:player-actions:unban', { playerId, actionId, input })
  },
  playerNotes: {
    list: (playerId: number, limit: number, offset: number) =>
      ipcRenderer.invoke(`server:player-notes:list`, { playerId, limit, offset }),
    create: (playerId: number, input: unknown) =>
      ipcRenderer.invoke(`server:player-notes:create`, { playerId, input }),
    update: (playerId: number, noteId: number, input: unknown) =>
      ipcRenderer.invoke(`server:player-notes:update`, { playerId, noteId, input })
  },
  userReferences: {
    list: (limit: number, offset: number) => ipcRenderer.invoke(`server:user-references:list`, { limit, offset }),
    get: (userId: number) => ipcRenderer.invoke(`server:user-references:get`, { userId })
  },
  playerProfileByPlayfab: (playfabId: string) => ipcRenderer.invoke('server:player:by-playfab', { playfabId }),
  refreshPlayerProfileByPlayfab: (playfabId: string) => ipcRenderer.invoke('server:player:refresh-by-playfab', { playfabId }),
  serverProfiles: {
    list: (owner: { type: 'user' | 'team'; id: number }) => ipcRenderer.invoke('server:profiles:list', { owner }),
    assignments: () => ipcRenderer.invoke('server:profiles:assignments'),
    active: (externalId?: string | null) => ipcRenderer.invoke('server:profiles:active', { externalId }),
    get: (owner: { type: 'user' | 'team'; id: number }, profileId: number) => ipcRenderer.invoke('server:profiles:get', { owner, profileId }),
    create: (owner: { type: 'user' | 'team'; id: number }, input: unknown) => ipcRenderer.invoke('server:profiles:create', { owner, input }),
    update: (owner: { type: 'user' | 'team'; id: number }, profileId: number, input: unknown) => ipcRenderer.invoke('server:profiles:update', { owner, profileId, input }),
    reset: (owner: { type: 'user' | 'team'; id: number }, profileId: number) => ipcRenderer.invoke('server:profiles:reset', { owner, profileId }),
    delete: (owner: { type: 'user' | 'team'; id: number }, profileId: number) => ipcRenderer.invoke('server:profiles:delete', { owner, profileId })
  },
  recordActionByPlayfab: (input: unknown) => ipcRenderer.invoke('server:player-actions:record-by-playfab', input),
  recordUnbanByPlayfab: (input: unknown) => ipcRenderer.invoke('server:player-actions:record-unban-by-playfab', input)
};

const chivOverlay = {
  isVisible: () => ipcRenderer.invoke('overlay:isVisible'),
  notificationPollMs: () => ipcRenderer.invoke('overlay:notificationPollMs'),
  checkForUpdate: () => ipcRenderer.invoke(`app:update:check`),
  openUpdatePage: () => ipcRenderer.invoke(`app:update:open`),
  focusState: () => ipcRenderer.invoke('overlay:focusState'),
  hide: () => ipcRenderer.invoke('overlay:hide'),
  show: () => ipcRenderer.invoke('overlay:show'),
  setModalOpen: (open: boolean) => ipcRenderer.invoke(`overlay:setModalOpen`, open),
  setTextInputActive: (active: boolean) => ipcRenderer.send(`overlay:textInputActive`, active),
  showToast: (request: ToastRequest) => ipcRenderer.invoke('toast:show', request),
  hideToast: () => ipcRenderer.invoke('toast:hide'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (update: unknown) => ipcRenderer.invoke('settings:update', update),
  debugLog: (scope: string, message: string) => ipcRenderer.send('overlay:debugLog', scope, message),
  onSnapshotLookup: (callback: (event: SnapshotLookupEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: SnapshotLookupEvent) => {
      callback(payload);
    };

    ipcRenderer.on('overlay:snapshotLookup', listener);

    return () => {
      ipcRenderer.removeListener('overlay:snapshotLookup', listener);
    };
  },
  onToast: (callback: (request: ToastRequest) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: ToastRequest) => {
      callback(payload);
    };

    ipcRenderer.on('toast:notification', listener);

    return () => {
      ipcRenderer.removeListener('toast:notification', listener);
    };
  },
  onVisibilityChange: (callback: VisibilityListener) => {
    const listener = (_event: Electron.IpcRendererEvent, visible: unknown) => {
      callback(visible === true);
    };

    ipcRenderer.on('overlay:visibility', listener);

    return () => {
      ipcRenderer.removeListener('overlay:visibility', listener);
    };
  }
};

contextBridge.exposeInMainWorld('chivCore', chivCore);
contextBridge.exposeInMainWorld('chivAuth', chivAuth);
contextBridge.exposeInMainWorld('chivServer', chivServer);
contextBridge.exposeInMainWorld('chivOverlay', chivOverlay);
