import { createAppUpdateBridge } from './appUpdateBridge'
import type { PlayerSearchRequest } from '../shared/playerSearchRequest'
import type { ToastRequest } from '../shared/notificationToast'
import type { TeamServerClaimsInput } from '@spellbook/shared/teamServers.js'
import { contextBridge, ipcRenderer } from 'electron';
import { createDebugBridge, createDebugObserver } from './debugBridge'
import type { GameServerListQueryInput } from '@spellbook/shared/gameServerListQuery.js'
import type { AdminNotificationInput, NotificationTone } from '@spellbook/shared/notifications.js'
import { createRuntimeCoreBridge, type RuntimeIpcRenderer } from './coreBridge'
import { createDiscordInstallBridge, type DiscordInstallIpcRenderer } from './discordInstallBridge'
import { createDashboardBridge } from './dashboardBridge'
import { createDiagnosticsBridge } from './diagnosticsBridge'
import type { DiscordBroadcastMessage } from '@spellbook/shared/discordBroadcasts.js'
import type { TrayDestination } from '../shared/trayNavigation'
import type { PendingPlayerLink } from '@spellbook/shared/appLinks'
import { createEvidenceBridge } from './evidenceBridge'
import { createMaintenanceBridge } from './maintenanceBridge'
import { createForensicsBridge } from './forensicsBridge'
import type { SnapshotLookupEvent } from '@spellbook/shared/snapshotLookup'

type VisibilityListener = (visible: boolean) => void;

type CoreBatchCommand = {
  commandType: 'server_message' | 'admin_message' | 'warn' | 'kick' | 'ban' | 'unban'
  message: string
  delayMs: number
  playfabId?: string
  hours?: number
}

type GameServerPatch = {
  displayName?: string | null
}

type TickAction = `leaderboard` | `servers` | `cleanup` | `normalizePlayerNames` | `enrichEmptyPlayers` | `playerSearch`

type PlayerListQuery = {
  page?: number
  include?: string[]
  search?: string
  searchMode?: `normal` | `historic`
  isOnline?: boolean
  active?: boolean
  minRank?: number
  maxRank?: number
  noRank?: boolean
  minOffenses?: number
  minPlaytimeHours?: number
  maxPlaytimeHours?: number
  newAccounts?: boolean
  banned?: boolean
  sortBy?: 'relevance' | 'rank' | 'lastSeen' | 'accountCreated' | 'wantedAt' | 'candidateAt'
  sortOrder?: 'asc' | 'desc'
  createdAfter?: string
  createdBefore?: string
  lastSeenAfter?: string
  lastSeenBefore?: string
}

const chivCore = {
  ...createRuntimeCoreBridge(ipcRenderer as unknown as RuntimeIpcRenderer),
  health: () => ipcRenderer.invoke('core:health'),
  listPlayers: () => ipcRenderer.invoke('core:listPlayers'),
  nativeListPlayers: () => ipcRenderer.invoke('core:nativeListPlayers'),
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
  openHelp: (destination?: `discord` | `guide` | `website`) => ipcRenderer.invoke(`auth:help`, destination),
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
  maintenance: createMaintenanceBridge(ipcRenderer),
  forensics: { alt: createForensicsBridge(ipcRenderer) },
  evidence: {
    ...createEvidenceBridge(ipcRenderer),
    select: () => ipcRenderer.invoke(`server:evidence:select`),
    checkDuplicates: (originalByteSize: number, originalSha256: string) => ipcRenderer.invoke(`server:evidence:check-duplicates`, { originalByteSize, originalSha256 }),
    upload: (input: unknown) => ipcRenderer.invoke(`server:evidence:upload`, input),
    list: (playerId: number) => ipcRenderer.invoke(`server:evidence:list`, { playerId }),
    get: (evidenceId: number) => ipcRenderer.invoke(`server:evidence:get`, { evidenceId }),
    byToken: (token: string) => ipcRenderer.invoke(`server:evidence:by-token`, { token }),
    comments: (evidenceId: number) => ipcRenderer.invoke(`server:evidence:comments`, { evidenceId })
  },
  actions: (operation: string, input?: unknown) => ipcRenderer.invoke(`server:actions`, operation, input),
  ...createDashboardBridge(ipcRenderer),
  getPlayers: (query: PlayerListQuery = {}, request?: PlayerSearchRequest) => ipcRenderer.invoke(`server:players:list`, query, request),
  cancelPlayerSearch: (request: PlayerSearchRequest) => ipcRenderer.invoke(`server:players:cancel`, request),
  enrichPlayers: (playfabIds: string[]) => ipcRenderer.invoke(`server:players:enrich`, { playfabIds }),
  getWantedPlayers: (query: PlayerListQuery = {}, request?: PlayerSearchRequest) => ipcRenderer.invoke(`server:wanted:list`, query, request),
  candidates: {
    list: (query: PlayerListQuery = {}, request?: PlayerSearchRequest) => ipcRenderer.invoke(`server:wanted:candidates:list`, query, request),
    get: (candidateId: number) => ipcRenderer.invoke(`server:wanted:candidates:get`, { candidateId }),
    accept: (candidateId: number, expectedRevision: number, reviewNote: string) => ipcRenderer.invoke(`server:wanted:candidates:accept`, { candidateId, expectedRevision, reviewNote }),
    reject: (candidateId: number, expectedRevision: number, reviewNote: string) => ipcRenderer.invoke(`server:wanted:candidates:reject`, { candidateId, expectedRevision, reviewNote })
  },
  wanted: {
    get: (playerId: number) => ipcRenderer.invoke(`server:wanted:get`, { playerId }),
    create: (input: unknown) => ipcRenderer.invoke(`server:wanted:create`, input),
    revert: (playerId: number, sourceActionId: number) => ipcRenderer.invoke(`server:wanted:revert`, { playerId, sourceActionId }),
    remove: (playerId: number) => ipcRenderer.invoke(`server:wanted:remove`, { playerId })
  },
  notifications: {
    list: (afterId?: number, beforeId?: number, visibility?: import('@spellbook/shared/notifications.js').NotificationVisibility) => ipcRenderer.invoke(`server:notifications:list`, { afterId, beforeId, visibility }),
    restore: (notificationId: number) => ipcRenderer.invoke(`server:notifications:restore`, { notificationId }),
    deleteAll: () => ipcRenderer.invoke(`server:notifications:delete-all`),
    setRead: (notificationId: number, read: boolean) => ipcRenderer.invoke('server:notifications:set-read', { notificationId, read }),
    markAllRead: () => ipcRenderer.invoke(`server:notifications:mark-all-read`),
    delete: (notificationId: number) => ipcRenderer.invoke('server:notifications:delete', { notificationId })
  },
  todo: () => ipcRenderer.invoke(`server:todo`),
  profileOwners: (teamId?: number) => ipcRenderer.invoke('server:profile-owners:list', { teamId }),
  admin: {
    discord: {
      guilds: () => ipcRenderer.invoke(`server:admin:discord:guilds`),
      queue: (beforeId?: number) => ipcRenderer.invoke(`server:admin:discord:queue`, { beforeId }),
      latestRelease: () => ipcRenderer.invoke(`server:admin:discord:latest-release`),
      broadcast: (message: DiscordBroadcastMessage) => ipcRenderer.invoke(`server:admin:discord:broadcast`, message),
      send: (message: DiscordBroadcastMessage & { guildId: string }) => ipcRenderer.invoke(`server:admin:discord:send`, message),
      broadcastRelease: (version: string) => ipcRenderer.invoke(`server:admin:discord:broadcast-release`, { version })
    },
    auditLogs: {
      list: (query: unknown = {}) => ipcRenderer.invoke(`server:admin:audit-logs:list`, query)
    },
    notificationTests: {
      create: (tone: NotificationTone) => ipcRenderer.invoke('server:admin:notification-tests:create', { tone })
    },
    notifications: {
      send: (input: AdminNotificationInput) => ipcRenderer.invoke(`server:admin:notifications:send`, input)
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
    settings: (teamId: number) => ipcRenderer.invoke(`server:teams:settings`, { teamId }),
    saveSettings: (teamId: number, input: unknown) => ipcRenderer.invoke(`server:teams:settings:save`, { teamId, input }),
    guidelines: (teamId: number) => ipcRenderer.invoke(`server:teams:guidelines`, { teamId }),
    saveGuidelines: (teamId: number, input: unknown) => ipcRenderer.invoke(`server:teams:guidelines:save`, { teamId, input }),
    guidelineHistory: (teamId: number, before?: number) => ipcRenderer.invoke(`server:teams:guidelines:history`, { teamId, before }),
    updateServers: (teamId: number, input: TeamServerClaimsInput) => ipcRenderer.invoke(`server:teams:servers:update`, { teamId, input }),
    pendingRequestCount: () => ipcRenderer.invoke(`server:teams:pending-count`),
    directory: () => ipcRenderer.invoke(`server:teams:directory`),
    requestAccess: (teamId: number) => ipcRenderer.invoke(`server:teams:request`, { teamId }),
    requests: (teamId: number) => ipcRenderer.invoke(`server:teams:requests`, { teamId }),
    decideRequest: (teamId: number, userId: number, decision: `approve` | `reject`) => ipcRenderer.invoke(`server:teams:decide-request`, { teamId, userId, decision }),
    list: (all = false) => ipcRenderer.invoke('server:teams:list', { all }),
    create: (name: string) => ipcRenderer.invoke('server:teams:create', { name }),
    delete: (teamId: number) => ipcRenderer.invoke(`server:teams:delete`, { teamId }),
    rename: (teamId: number, name: string) => ipcRenderer.invoke(`server:teams:rename`, { teamId, name }),
    transferOwnership: (teamId: number, userId: number) => ipcRenderer.invoke(`server:teams:transfer-ownership`, { teamId, userId }),
    members: (teamId: number) => ipcRenderer.invoke('server:teams:members', { teamId }),
    memberOptions: (teamId: number) => ipcRenderer.invoke('server:teams:member-options', { teamId }),
    addMember: (teamId: number, userId: number) => ipcRenderer.invoke('server:teams:add-member', { teamId, userId }),
    decideInvitation: (teamId: number, invitationId: number, decision: import('@spellbook/shared/notifications.js').TeamInvitationDecision) => ipcRenderer.invoke(`server:teams:decide-invitation`, { teamId, invitationId, decision }),
    removeMember: (teamId: number, userId: number) => ipcRenderer.invoke('server:teams:remove-member', { teamId, userId }),
    setPermissions: (teamId: number, userId: number, permissions: string[]) => ipcRenderer.invoke('server:teams:permissions', { teamId, userId, permissions }),
    discord: (teamId: number) => ipcRenderer.invoke(`server:teams:discord`, { teamId }),
    discordConfiguration: (teamId: number) => ipcRenderer.invoke(`server:teams:discord:configuration`, { teamId }),
    discordResources: (teamId: number) => ipcRenderer.invoke(`server:teams:discord:resources`, { teamId }),
    saveDiscordConfiguration: (teamId: number, input: import('@spellbook/shared/discordConfiguration').DiscordConfigurationPatch) =>
      ipcRenderer.invoke(`server:teams:discord:configuration:save`, { teamId, input }),
    installDiscord: (teamId: number) => ipcRenderer.invoke('discord:install', { teamId }),
    unlinkDiscord: (teamId: number) => ipcRenderer.invoke(`server:teams:discord:unlink`, { teamId }),
    onDiscordInstallCompleted: discordInstall.onCompleted
  },
  gameServers: {
    overview: (gameServerId: number, period: import('@spellbook/shared/gameServerOverview').ServerHistoryPeriod) => ipcRenderer.invoke(`server:gameservers:overview`, { gameServerId, period }),
    admins: (gameServerId: number, offset: number) => ipcRenderer.invoke(`server:gameservers:admins`, { gameServerId, offset }),
    playerCounts: (gameServerId: number) => ipcRenderer.invoke(`server:gameservers:player-counts`, { gameServerId }),
    presence: (ids: number[]) => ipcRenderer.invoke(`server:players:presence`, ids),
    players: (gameServerId: number) => ipcRenderer.invoke(`server:gameservers:players`, { gameServerId }),
    get: (gameServerId: number, query: { a2s?: boolean, view?: `live` } = {}) => ipcRenderer.invoke(`server:gameservers:get`, { gameServerId, ...query }),
    list: (query: GameServerListQueryInput = {}) => ipcRenderer.invoke(`server:gameservers:list`, query),
    filterOptions: () => ipcRenderer.invoke(`server:gameservers:filter-options`),
    update: (gameServerId: number, patch: GameServerPatch) =>
      ipcRenderer.invoke('server:gameservers:update', { gameServerId, patch }),
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
  visitPlayerProfileByPlayfab: (playfabId: string) => ipcRenderer.invoke(`server:player:visit-by-playfab`, { playfabId }),
  playerProfileByPlayfab: (playfabId: string) => ipcRenderer.invoke('server:player:by-playfab', { playfabId }),
  playerTimeline: (playerId: number, limit = 30, before?: string) =>
    ipcRenderer.invoke(`server:player:timeline`, { playerId, limit, before }),
  refreshPlayerProfileByPlayfab: (playfabId: string) => ipcRenderer.invoke('server:player:refresh-by-playfab', { playfabId }),
  serverProfiles: {
    presets: () => ipcRenderer.invoke(`server:profiles:presets`),
    preset: (profileId: number) => ipcRenderer.invoke(`server:profiles:preset`, { profileId }),
    setEnabled: (owner: { type: 'user' | 'team'; id: number }, profileId: number, isEnabled: boolean) => ipcRenderer.invoke(`server:profiles:set-enabled`, { owner, profileId, isEnabled }),
    list: (owner: { type: 'user' | 'team'; id: number }) => ipcRenderer.invoke('server:profiles:list', { owner }),
    assignments: () => ipcRenderer.invoke('server:profiles:assignments'),
    active: (externalId?: string | null) => ipcRenderer.invoke('server:profiles:active', { externalId }),
    get: (owner: { type: 'user' | 'team'; id: number }, profileId: number) => ipcRenderer.invoke('server:profiles:get', { owner, profileId }),
    create: (owner: { type: 'user' | 'team'; id: number }, input: unknown) => ipcRenderer.invoke('server:profiles:create', { owner, input }),
    update: (owner: { type: 'user' | 'team'; id: number }, profileId: number, input: unknown) => ipcRenderer.invoke('server:profiles:update', { owner, profileId, input }),
    delete: (owner: { type: 'user' | 'team'; id: number }, profileId: number) => ipcRenderer.invoke('server:profiles:delete', { owner, profileId })
  },
  recordActionByPlayfab: (input: unknown) => ipcRenderer.invoke('server:player-actions:record-by-playfab', input),
  recordUnbanByPlayfab: (input: unknown) => ipcRenderer.invoke('server:player-actions:record-unban-by-playfab', input)
};

const chivOverlay = {
  pendingAppLink: (): Promise<PendingPlayerLink | null> => ipcRenderer.invoke(`app-link:pending`),
  acknowledgeAppLink: (sequence: number): Promise<boolean> => ipcRenderer.invoke(`app-link:acknowledge`, sequence),
  onAppLinkChanged: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on(`app-link:changed`, listener)
    return () => ipcRenderer.removeListener(`app-link:changed`, listener)
  },
  onHistoryNavigate: (callback: (direction: `back` | `forward`) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, direction: `back` | `forward`) => callback(direction)
    ipcRenderer.on(`overlay:history`, listener)
    return () => ipcRenderer.removeListener(`overlay:history`, listener)
  },
  onNavigate: (callback: (destination: TrayDestination) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, destination: TrayDestination) => callback(destination)
    ipcRenderer.on(`overlay:navigate`, listener)
    return () => ipcRenderer.removeListener(`overlay:navigate`, listener)
  },
  isVisible: () => ipcRenderer.invoke('overlay:isVisible'),
  notificationPollMs: () => ipcRenderer.invoke('overlay:notificationPollMs'),
  ...createAppUpdateBridge(ipcRenderer),
  focusState: () => ipcRenderer.invoke('overlay:focusState'),
  hide: () => ipcRenderer.invoke('overlay:hide'),
  show: () => ipcRenderer.invoke('overlay:show'),
  setModalOpen: (open: boolean) => ipcRenderer.invoke(`overlay:setModalOpen`, open),
  setTextInputActive: (active: boolean) => ipcRenderer.send(`overlay:textInputActive`, active),
  showToast: (request: ToastRequest) => ipcRenderer.invoke('toast:show', request),
  hideToast: (group?: string) => ipcRenderer.invoke(`toast:hide`, group),
  resizeToast: (height: number) => ipcRenderer.send(`toast:resize`, height),
  activateToastAction: (id: number) => ipcRenderer.invoke(`toast:activate`, id),
  onToastAction: (callback: (id: number) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, id: number) => callback(id)
    ipcRenderer.on(`toast:action`, listener)
    return () => ipcRenderer.removeListener(`toast:action`, listener)
  },
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (update: unknown) => ipcRenderer.invoke('settings:update', update),
  setKeybindRecording: (recording: boolean) => ipcRenderer.invoke(`settings:record-keybind`, recording),
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

    ipcRenderer.on('toast:notification', listener)
    ipcRenderer.send(`toast:ready`)

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

if (process.argv.includes(`--spellbook-debug-observer`)) {
  contextBridge.exposeInMainWorld(`chivDebug`, createDebugObserver(ipcRenderer))
} else {
  contextBridge.exposeInMainWorld(`chivCore`, chivCore)
  contextBridge.exposeInMainWorld(`chivDebug`, createDebugBridge(ipcRenderer))
  contextBridge.exposeInMainWorld(`chivAuth`, chivAuth)
  contextBridge.exposeInMainWorld(`chivServer`, chivServer)
  contextBridge.exposeInMainWorld(`chivOverlay`, chivOverlay)
  contextBridge.exposeInMainWorld(`chivDiagnostics`, createDiagnosticsBridge(ipcRenderer))
}
