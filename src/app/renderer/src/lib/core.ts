import type { GameServerListQueryInput } from '@spellbook/shared/gameServerListQuery.js'
import type { ServerProfileActionIconKey } from '@spellbook/shared/serverProfileActionIcons.js'
import type { NotificationTone } from '@spellbook/shared/notifications.js'
import type { DiscordInstallResult } from '../../../shared/discordInstall.js'
import type { ConsoleKeyCode } from '../../../shared/consoleKey'
export type { GameServerListQueryInput } from '@spellbook/shared/gameServerListQuery.js'
export type { ServerProfileActionIconKey } from '@spellbook/shared/serverProfileActionIcons.js'
export type { DiscordInstallResult } from '../../../shared/discordInstall.js'
export type {
  DashboardActionScope,
  DashboardActionType,
  DashboardRecentAction,
  DashboardSeries,
  DashboardSnapshot,
} from '@spellbook/shared/dashboard.js'
export { serverProfileActionIcons } from '@spellbook/shared/serverProfileActionIcons.js'

export type CoreCallResult = {
  ok: boolean;
  status: number;
  statusText: string;
  data: unknown;
  error?: {
    code: string;
    message: string;
  };
};

export type ChivCoreApi = {
  health: () => Promise<CoreCallResult>;
  meta: () => Promise<CoreCallResult>
  listPlayers: () => Promise<CoreCallResult>;
  currentGameSnapshot: () => Promise<CurrentGameSnapshot | null>
  refreshCurrentGameSnapshot: () => Promise<CoreCallResult>
  onCurrentGameSnapshot: (callback: (snapshot: CurrentGameSnapshot | null) => void) => () => void
  sentinelState: () => Promise<SentinelState>
  setSentinelEnabled: (enabled: boolean) => Promise<SentinelState>
  onSentinelStateChange: (callback: (state: SentinelState) => void) => () => void
  nativeListPlayers: () => Promise<CoreCallResult>
  snapshot: () => Promise<CoreCallResult>;
  executeBatch: (commands: CoreBatchCommand[]) => Promise<CoreCallResult>
  message: (kind: CoreMessageKind, message: string) => Promise<CoreCallResult>
  antiAfkState: () => Promise<AntiAfkState>
  setAntiAfkEnabled: (enabled: boolean) => Promise<AntiAfkState>
  sendCommand: (command: string, expectClipboard?: boolean, restoreClipboard?: boolean) => Promise<CoreCallResult>;
  kick: (playfabId: string, reason: string) => Promise<CoreCallResult>;
  ban: (playfabId: string, hours: number, reason: string) => Promise<CoreCallResult>;
  unban: (playfabId: string) => Promise<CoreCallResult>
  warn: (message: string) => Promise<CoreCallResult>;
  serverMessage: (message: string) => Promise<CoreCallResult>;
};

export type CoreMessageKind = 'admin' | 'server'

export type AntiAfkState = {
  enabled: boolean
}

export type SentinelState = Readonly<{
  enabled: boolean
}>

export type CurrentGameSnapshot = Readonly<{
  version: number
  observedAt: string
  gameServerId: number
  externalId: string
  serverName: string | null
  serverAddress: string | null
  players: readonly Readonly<PlayerEntry>[]
  parseWarnings: readonly string[]
}>

export type UserSession = {
  id: number;
  discordId: string | null;
  username: string;
  displayName: string;
  playfabId: string | null;
  avatarUrl: string | null;
  isActive: boolean
  isSuperadmin: boolean;
  wantedCreationEnabled: boolean;
  onboardingComplete: boolean;
};

export type ChivAuthApi = {
  openHelp: () => Promise<void>;
  login: () => Promise<CoreCallResult>;
  session: () => Promise<CoreCallResult>;
  updateProfile: (profile: { displayName: string; playfabId: string }) => Promise<CoreCallResult>;
  logout: () => Promise<CoreCallResult>;
  onSessionChange: (callback: (result: CoreCallResult) => void) => () => void;
};

export type ProfileOwner = { type: 'user' | 'team'; id: number };
export type SystemProfileOwner = { type: 'system'; id: 0 };
export type ServerProfileOwner = ProfileOwner | SystemProfileOwner;
export type ProfileOwnerOption = ProfileOwner & { name: string; permissions: string[] };
export type TeamRecord = { id: number; ownerUserId: number; name: string; permissions: string[] };
export type TeamDirectoryEntry = { id: number, name: string, pending: boolean, member: boolean }
export type TeamJoinRequest = { userId: number, displayName: string, username: string, requestedAt: string }
export type DiscordTeamConnection = { guildId: string; guildName: string }
export type UserTeamSummary = TeamRecord
export type AdminTeamSummary = {
  id: number
  ownerUserId: number
  name: string
  ownerDisplayName: string
  memberCount: number
}
export type TeamMemberRecord = {
  userId: number;
  username: string;
  displayName: string;
  playfabId: string | null;
  avatarUrl: string | null;
  isOwner: boolean;
  permissions: string[];
};

export type AdminUserRecord = {
  id: number;
  discordId: string | null;
  username: string;
  displayName: string;
  playfabId: string | null;
  avatarUrl: string | null;
  isSuperadmin: boolean;
  wantedCreationEnabled: boolean;
  isActive: boolean;
  bannedAt: string | null;
  banReason: string | null;
  lastLogin: string | null;
  lastActive: string | null
  currentVersion: string | null
  lastSeen: string | null;
  createdAt: string;
  updatedAt: string;
  permissions: string[];
  teams: UserTeamSummary[];
};

export type SnapshotMatchTuning = {
  fullConfidence: number;
  prefixLength: number;
  prefixConfidence: number;
  suffixLength: number;
  suffixConfidence: number;
  wordConfidence: number;
  maxSpaces: number;
};

export type SnapshotLookupEvent = {
  ok: boolean;
  hasText: boolean;
  text: string;
  lines: string[];
  matching?: SnapshotMatchTuning;
  error?: string;
};

export type ToastRequest = {
  message: string;
  level: "success" | "error" | "warning" | "info";
  durationMs?: number;
};

export type ChivOverlayApi = {
  isVisible: () => Promise<boolean>;
  notificationPollMs: () => Promise<number>
  checkForUpdate: () => Promise<string | null>
  openUpdatePage: () => Promise<void>
  focusState: () => Promise<OverlayFocusState>;
  hide: () => Promise<void>;
  show: () => Promise<void>;
  setModalOpen: (open: boolean) => Promise<void>
  setTextInputActive: (active: boolean) => void
  showToast: (request: ToastRequest) => Promise<void>;
  hideToast: () => Promise<void>;
  getSettings: () => Promise<AppSettingsSnapshot>;
  updateSettings: (update: AppSettingsUpdate) => Promise<AppSettingsSnapshot>;
  debugLog: (scope: string, message: string) => void;
  onSnapshotLookup: (callback: (event: SnapshotLookupEvent) => void) => () => void;
  onToast: (callback: (request: ToastRequest) => void) => () => void;
  onVisibilityChange: (callback: (visible: boolean) => void) => () => void;
};

export type AppSettings = {
  audioSfxEnabled: boolean;
  audioSfxVolume: number;
  selectedDisplayId: number | null;
  consoleKey: ConsoleKeyCode | null
};

export type AppSettingsUpdate = Partial<AppSettings>;

export type SettingsDisplayOption = {
  id: number;
  label: string;
  isPrimary: boolean;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type AppSettingsSnapshot = {
  settings: AppSettings;
  displays: SettingsDisplayOption[];
  effectiveDisplayId: number;
};

export type OverlayFocusState = {
  gameIsFocused: boolean;
  overlayIsFocused: boolean;
  checkedAt: string;
  coreReachable: boolean;
  coreStatus: number;
  error?: string;
};

export type PlayerListQuery = {
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

export type ActiveBanKind = "hacker" | "other"

export type DbPlayerListItem = {
  id: number;
  playfabId: string;
  rank?: number | null;
  latestName?: string | null;
  latestNormalizedName?: string | null;
  lastLogin: string | null
  playtimeHours: number | null
  activeBanKind: ActiveBanKind | null
  isOnline: boolean;
  lastSeen?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type PlayerPlayFabData = {
  account: {
    accountCreatedAt: string | null
  } | null
  statistics: {
    rank: number | null
    globalXp: number | null
    playtimeTicks: number | null
    playtimeExTicks: number | null
    playtimeHours: number | null
    lastLoginAt: string | null
  } | null
  freshness: {
    stale: boolean
    refreshFailed: boolean
  }
}

export type GameServerRecord = {
  id: number;
  externalId: string;
  name: string;
  displayName: string | null;
  clanName: string | null;
  clanTag: string | null;
  region: string | null
  mapName: string | null
  gameMode: string | null
  buildId: string | null
  host: string | null
  port: number | null
  queryPort: number | null
  pingPort: number | null
  serverHostname: string | null
  maxPlayers: number | null
  currentPlayerCount?: number | null
  official: boolean | null
  platform: string | null
  buildVersion: string | null
  runTime: number | null
  gameServerState: number | null
  lastHeartbeat: number | null
  lastSeen: string | null
  deletedAt: string | null
  createdAt: string
};

export type GameServerListMeta = {
  currentPage: number
  pageSize: 100
  totalPages: number
  totalResults: number
  hasPrevious: boolean
  hasNext: boolean
}

export type GameServerListPage = {
  servers: GameServerRecord[]
  meta: GameServerListMeta
}

export type GameServerPlayerCountRecord = {
  id: number
  gameServerId: number
  playerCount: number
  source: `listplayers` | `torn_banner`
  userId: number | null
  observedAt: string
}

export type GameServerProfile = {
  gameServer: GameServerRecord & { tornBannerRaw: unknown }
  playerCounts: GameServerPlayerCountRecord[]
  assignment: ServerProfileAssignment | null
  variables: GameServerParam[]
  canEditVariables: boolean
}

export type GameServerPatch = {
  displayName?: string | null;
  clanName?: string | null;
  clanTag?: string | null;
};

export type GameServerParam = {
  id: number
  gameServerId: number
  label: string
  key: string
  value: string
  sortOrder: number
  createdAt?: string
  updatedAt?: string
}

export type ServerVariableInput = {
  label: string
  value: string
  sortOrder?: number
}

export type ServerVariableDefinition = {
  label: string
  key: string
}

export type ActiveGameServer = {
  id: number;
  externalId: string;
  name: string;
  displayName: string | null;
  clanName: string | null;
  clanTag: string | null;
  maxPlayers?: number | null;
};

export type PlayerOffenseType = "hacker" | "ffa" | "verbal_abuse" | "griefing" | "exploiting" | "toxic_behavior" | "low_level" | "votekick_abuse" | "other";
export type PlayerActionType = "ban" | "kick" | "warn" | "mute" | "unban" | "mock";
export type PlayerActionScope = "local" | "global"
export type PlayerActionCreationType = "manual" | "auto"
export type PlayerNoteScope = "me" | "admins" | "public"
export type ServerProfileCommandType = "server_message" | "warn" | "kick" | "ban" | "unban"
export type CoreBatchCommandType = ServerProfileCommandType | "unban"
export type ServerProfileActionDomain = "player" | "server";

export type CoreBatchCommand = {
  commandType: CoreBatchCommandType
  message: string
  delayMs: number
  playfabId?: string
  hours?: number
}

export type PlayerDbProfile = {
  player: DbPlayerListItem & { playfab: PlayerPlayFabData };
  names: Array<{ id: number; playerId: number; name: string; normalizedName: string; lastSeen: string }>;
  meta: Array<{ id: number; playerId: number; key: string; value: string; createdAt?: string | null }>;
  actions: PlayerAction[]
  noteCount: number
};

export type PlayerAction = {
  id: number;
  playerId: number;
  gameServerId: number | null;
  authorId: number;
  actionType: PlayerActionType;
  offenseType: PlayerOffenseType | null;
  duration: number | null;
  reason: string | null;
  scope: PlayerActionScope
  relatedActionId: number | null
  autoban: boolean
  creationType?: PlayerActionCreationType
  originalActionId: number | null
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: { id: number; username: string | null; playfabId: string | null };
  gameServer: { id: number; name: string | null; displayName: string | null } | null;
};

export type PlayerNoteUserReference = {
  id: number
  username: string
  displayName: string
  isActive: boolean
  bannedAt: string | null
}

export type PlayerNote = {
  id: number
  playerId: number
  author: { id: number; username: string | null; playfabId: string | null }
  content: string
  scope: PlayerNoteScope
  actionReferenceIds: number[]
  userReferenceIds: number[]
  actionReferences: PlayerAction[]
  userReferences: PlayerNoteUserReference[]
  createdAt: string
  updatedAt: string
}

export type GameServerFilterOptions = { regions: string[], gameModes: string[] }

export type PlayerNoteMutation = { note: PlayerNote, noteCount: number }

export type WantedPlayerListItem = DbPlayerListItem & {
  banCount: number
  noteCount: number
  wanted: {
    scope: PlayerActionScope | null
    reason: string | null
    offenseType: PlayerOffenseType | null
    duration: number | null
    author: { id: number; username: string | null; playfabId: string | null } | null
    wantedAt: string
    originalActionId: number | null
    actionType: `ban` | `unban` | `mock` | null
    originServer: { id: number; name: string | null; displayName: string | null } | null
    completedServerCount: number
    targetServerCount: number | null
  }
}

export type WantedDetail = {
  wanted: {
    id: number
    playerId: number
    originalActionId: number | null
    deletedAt: string | null
  }
  player: DbPlayerListItem
  sourceAction: PlayerAction | null
  automaticActions: PlayerAction[]
  targetActions: PlayerAction[]
  targetServerIds: number[]
  noteCount: number
  canRevert: boolean
  canRemove: boolean
}

export type AuditLogRecord = {
  id: number
  eventType: string
  outcome: string
  actorId: number | null
  targetType: string
  targetId: string
  gameServerId: number | null
  correlationId: string | null
  meta: Record<string, unknown>
  createdAt: string
}

export type AuditLogPage = {
  logs: AuditLogRecord[]
  nextBeforeId: number | null
}

export type ServerProfileCommand = {
  id?: number;
  actionId?: number;
  commandType: ServerProfileCommandType;
  sortOrder: number;
  delayMs: number;
  durationHours?: number | null;
  message: string;
  offenseType?: PlayerOffenseType | null;
};

export type ServerProfileAction = {
  id?: number;
  profileId?: number;
  label: string;
  description?: string | null;
  actionDomain: ServerProfileActionDomain;
  delayMs: number;
  sortOrder: number;
  isEnabled: boolean;
  iconKey: ServerProfileActionIconKey
  blockOnMissingVariables: boolean
  commands: ServerProfileCommand[];
};

export type ServerProfileServer = {
  id: number;
  owner: ProfileOwner;
  profileId: number;
  gameServerId: number;
  gameServerName?: string | null;
  createdAt?: string | null;
};

export type ServerProfileRecord = {
  id: number;
  owner: ServerProfileOwner;
  name: string;
  description?: string | null;
  isDefault: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ServerProfileGraph = {
  profile: ServerProfileRecord;
  servers: ServerProfileServer[];
  actions: ServerProfileAction[];
  availableVariables: ServerVariableDefinition[]
};

export type ServerProfileSummary = {
  profile: ServerProfileRecord;
  serverCount: number;
  serverIds: number[];
  actionCount: number;
  enabledActionCount: number;
  commandCount: number;
};

export type TickAction = 'leaderboard' | 'servers'
export type TickActionRunStatus = 'running' | 'stopping' | 'paused' | 'completed' | 'failed'
export type TickActionLogLevel = 'general' | 'warning' | 'error'

export type TickActionLog = {
  id: number
  runId: number
  level: TickActionLogLevel
  message: string
  createdAt: string
}

export type TickActionRun = {
  id: number
  action: TickAction
  status: TickActionRunStatus
  trigger: 'scheduled' | 'manual'
  triggeredByUserId: number | null
  cursor: number
  processedRecords: number
  totalRecords: number | null
  durationMs: number
  error: string | null
  startedAt: string
  finishedAt: string | null
  updatedAt: string
}

export type TickActionSummary = {
  action: TickAction
  label: string
  status: TickActionRunStatus | 'idle'
  supportsPause: boolean
  nextRunAt: string | null
  estimatedRemainingMs: number | null
  run: TickActionRun | null
}

const tickActionDefinitions = [
  { action: 'leaderboard', label: 'Leaderboard', supportsPause: true },
  { action: 'servers', label: 'Servers', supportsPause: false }
] as const

export function tickActionSummaries(actions: readonly TickActionSummary[]): TickActionSummary[] {
  return tickActionDefinitions.map(definition => actions.find(action => action.action === definition.action) ?? {
    ...definition,
    status: 'idle',
    nextRunAt: null,
    estimatedRemainingMs: null,
    run: null
  })
}

export function tickActionControlMessage(label: string, type: 'start' | 'stop' | 'resume'): string {
  if (type === 'start') { return `Executing Run: ${label}` }
  return `${label} ${type === 'stop' ? 'is stopping' : 'resumed'}.`
}

export function tickActionProcessedValue(
  processedRecords: number,
  durationMs: number,
  locale?: Intl.LocalesArgument
): string {
  const records = processedRecords.toLocaleString(locale)
  if (durationMs <= 0) return records
  const recordsPerSecond = Math.round(processedRecords / (durationMs / 1000))
  return `${records} (~${recordsPerSecond.toLocaleString(locale)} RPS)`
}

export {
	createTickActionLogClearState,
  filterTickActionLogs,
  mergeTickActionLogs,
	nextTickActionLogAfterId,
	tickActionLogClearState,
  tickActionLogBatchDelay,
  tickActionLogCounts,
  tickActionLogCue,
  tickActionLogLimit,
  tickActionPollDelay
} from './utils/tickActionLogs'

export { resolveOverlayView } from './utils/overlayView'

export type ServerProfileAssignment = ServerProfileServer & {
  profileName: string;
};

export type ActiveServerProfile = {
  source: "assigned" | "default";
  gameServer: ActiveGameServer | null;
  profile: ServerProfileGraph;
  profiles?: ServerProfileGraph[]
  variables: GameServerParam[]
};

export type ServerProfileGraphInput = {
  name?: string;
  description?: string | null;
  serverIds?: number[];
  actions?: ServerProfileAction[];
  transferOwner?: ProfileOwner;
};

export type RecordActionByPlayfabInput = {
  playfabId: string;
  playerName?: string | null;
  gameServerId: number;
  actionType: Exclude<PlayerActionType, "unban" | "mock">;
  offenseType: PlayerOffenseType;
  duration?: number | null;
  reason?: string | null;
  scope: PlayerActionScope
};

export type RecordUnbanByPlayfabInput = {
  playfabId: string
  playerName?: string | null
  gameServerId: number
  reason?: string | null
}

export type PlayerActionUnbanInput = {
  gameServerId: number
  reason?: string | null
}

export type PlayerNoteCreateInput = {
  content: string
  scope?: PlayerNoteScope
}

export type PlayerNoteUpdateInput = {
  content?: string
  scope?: PlayerNoteScope
}

export type WantedCreateInput = {
  playfabId: string
  mock?: boolean
}

export type AuditLogQuery = {
  beforeId?: number
  eventType?: string
  actorId?: number
  targetType?: string
  targetId?: string
  gameServerId?: number
  outcome?: string
  createdFrom?: string
  createdTo?: string
  limit?: number
}

export type ChivServerApi = {
  dashboard: {
    get: () => Promise<CoreCallResult>
  }
  getPlayers: (query?: PlayerListQuery) => Promise<CoreCallResult>;
  getWantedPlayers: (query?: PlayerListQuery) => Promise<CoreCallResult>
  wanted: {
    get: (playerId: number) => Promise<CoreCallResult>
    create: (input: WantedCreateInput) => Promise<CoreCallResult>
    revert: (playerId: number, sourceActionId: number) => Promise<CoreCallResult>
    remove: (playerId: number) => Promise<CoreCallResult>
  }
  notifications: {
    list: (afterId?: number) => Promise<CoreCallResult>
    setRead: (notificationId: number, read: boolean) => Promise<CoreCallResult>
    markAllRead: () => Promise<CoreCallResult>
    delete: (notificationId: number) => Promise<CoreCallResult>
  }
  todo: () => Promise<CoreCallResult>
  profileOwners: () => Promise<CoreCallResult>;
  admin: {
    auditLogs: {
      list: (query?: AuditLogQuery) => Promise<CoreCallResult>
    }
    notificationTests: {
      create: (tone: NotificationTone) => Promise<CoreCallResult>
    }
    users: {
      list: (params?: { limit?: number; offset?: number }) => Promise<CoreCallResult>;
      get: (userId: number) => Promise<CoreCallResult>;
      setWantedPermission: (userId: number, enabled: boolean) => Promise<CoreCallResult>
      setAccountEnabled: (userId: number, enabled: boolean) => Promise<CoreCallResult>
      ban: (userId: number, reason: string) => Promise<CoreCallResult>;
    }
    teams: {
      list: () => Promise<CoreCallResult>
      members: (teamId: number) => Promise<CoreCallResult>
    }
    tickActions: {
      list: () => Promise<CoreCallResult>
      logs: (runId: number, afterId?: number) => Promise<CoreCallResult>
      start: (action: TickAction) => Promise<CoreCallResult>
      stop: (action: TickAction) => Promise<CoreCallResult>
      resume: (action: TickAction) => Promise<CoreCallResult>
    }
  };
  teams: {
    directory: () => Promise<CoreCallResult>
    requestAccess: (teamId: number) => Promise<CoreCallResult>
    requests: (teamId: number) => Promise<CoreCallResult>
    decideRequest: (teamId: number, userId: number, decision: `approve` | `reject`) => Promise<CoreCallResult>
    list: () => Promise<CoreCallResult>;
    create: (name: string) => Promise<CoreCallResult>;
    delete: (teamId: number) => Promise<CoreCallResult>
    members: (teamId: number) => Promise<CoreCallResult>;
    memberOptions: (teamId: number) => Promise<CoreCallResult>;
    addMember: (teamId: number, userId: number) => Promise<CoreCallResult>;
    removeMember: (teamId: number, userId: number) => Promise<CoreCallResult>;
    setPermissions: (teamId: number, userId: number, permissions: string[]) => Promise<CoreCallResult>;
    discord: (teamId: number) => Promise<CoreCallResult>
    installDiscord: (teamId: number) => Promise<CoreCallResult>
    unlinkDiscord: (teamId: number) => Promise<CoreCallResult>
    onDiscordInstallCompleted: (callback: (result: DiscordInstallResult) => void) => () => void
  };
  gameServers: {
    get: (gameServerId: number) => Promise<CoreCallResult>
    list: (query?: GameServerListQueryInput) => Promise<CoreCallResult>;
    filterOptions: () => Promise<CoreCallResult>;
    update: (gameServerId: number, patch: GameServerPatch) => Promise<CoreCallResult>;
    updateVariables: (gameServerId: number, variables: ServerVariableInput[]) => Promise<CoreCallResult>
    delete: (gameServerId: number) => Promise<CoreCallResult>;
    restore: (gameServerId: number) => Promise<CoreCallResult>;
  };
  playerActions: {
    list: (playerId: number, limit: number, offset: number, actionType?: PlayerActionType) => Promise<CoreCallResult>
    get: (playerId: number, actionId: number) => Promise<CoreCallResult>
    unban: (playerId: number, actionId: number, input: PlayerActionUnbanInput) => Promise<CoreCallResult>
  }
  playerNotes: {
    list: (playerId: number, limit: number, offset: number) => Promise<CoreCallResult>
    create: (playerId: number, input: PlayerNoteCreateInput) => Promise<CoreCallResult>
    update: (playerId: number, noteId: number, input: PlayerNoteUpdateInput) => Promise<CoreCallResult>
  }
  userReferences: {
    list: (limit: number, offset: number) => Promise<CoreCallResult>
    get: (userId: number) => Promise<CoreCallResult>
  }
  playerProfileByPlayfab: (playfabId: string) => Promise<CoreCallResult>;
  refreshPlayerProfileByPlayfab: (playfabId: string) => Promise<CoreCallResult>;
  serverProfiles: {
    list: (owner: ProfileOwner) => Promise<CoreCallResult>;
    assignments: () => Promise<CoreCallResult>;
    active: (externalId?: string | null) => Promise<CoreCallResult>;
    get: (owner: ProfileOwner, profileId: number) => Promise<CoreCallResult>;
    create: (owner: ProfileOwner, input: ServerProfileGraphInput) => Promise<CoreCallResult>;
    update: (owner: ProfileOwner, profileId: number, input: ServerProfileGraphInput) => Promise<CoreCallResult>;
    reset: (owner: ProfileOwner, profileId: number) => Promise<CoreCallResult>;
    delete: (owner: ProfileOwner, profileId: number) => Promise<CoreCallResult>;
  };
  recordActionByPlayfab: (input: RecordActionByPlayfabInput) => Promise<CoreCallResult>
  recordUnbanByPlayfab: (input: RecordUnbanByPlayfabInput) => Promise<CoreCallResult>
};

export type ApiEnvelope<T> = {
  ok: boolean;
  requestId?: string | null;
  timestampUtc?: string | null;
  command?: string | null;
  data?: T | null;
  error?: {
    code?: string | null;
    message?: string | null;
  } | null;
  warnings?: string[] | null;
};

export type PlayerEntry = {
  index: number;
  name: string;
  playfabId: string;
  rawLine: string;
  eosPlayerId?: string | null;
  score?: number | null;
  rank?: number | null;
  kills?: number | null;
  deaths?: number | null;
  pingMs?: number | null;
};

export type ListPlayersData = {
  rawText: string;
  externalId?: string | null;
  serverName?: string | null;
  normalizedServerName?: string | null;
  serverIp?: string | null;
  serverPort?: number | null;
  serverAddress?: string | null;
  players: PlayerEntry[];
  rawLines: string[];
  parseWarnings: string[];
};

type JsonRecord = Record<string, unknown>;

export function getCoreApi(): ChivCoreApi {
  if (typeof window === 'undefined' || !window.chivCore) {
    throw new Error('Electron preload API is unavailable.');
  }

  return window.chivCore;
}

export function getOverlayApi(): ChivOverlayApi {
  if (typeof window === 'undefined' || !window.chivOverlay) {
    throw new Error('Electron overlay API is unavailable.');
  }

  return window.chivOverlay;
}

export function getServerApi(): ChivServerApi {
  if (typeof window === 'undefined' || !window.chivServer) {
    throw new Error('Electron server API is unavailable.');
  }

  return window.chivServer;
}

export function extractEnvelope<T>(result: CoreCallResult | null): ApiEnvelope<T> | null {
  if (!result || !isRecord(result.data)) {
    return null;
  }

  return result.data as ApiEnvelope<T>;
}

export function extractListPlayersData(result: CoreCallResult): ListPlayersData {
  const envelope = extractEnvelope<unknown>(result);
  const source = isRecord(envelope?.data) ? envelope.data : isRecord(result.data) ? result.data : null;

  if (!source) {
    return emptyListPlayersData();
  }

  return {
    rawText: getString(source, 'rawText') ?? getString(source, 'RawText') ?? '',
    externalId: getString(source, 'externalId') ?? getString(source, 'ExternalId'),
    serverName: getString(source, 'serverName') ?? getString(source, 'ServerName'),
    normalizedServerName: getString(source, 'normalizedServerName') ?? getString(source, 'NormalizedServerName'),
    serverIp: getString(source, 'serverIp') ?? getString(source, 'ServerIp'),
    serverPort: getNumber(source, 'serverPort') ?? getNumber(source, 'ServerPort'),
    serverAddress: getString(source, 'serverAddress') ?? getString(source, 'ServerAddress'),
    players: getPlayers(source),
    rawLines: getStringArray(source, 'rawLines') ?? getStringArray(source, 'RawLines') ?? [],
    parseWarnings: getStringArray(source, 'parseWarnings') ?? getStringArray(source, 'ParseWarnings') ?? []
  };
}

export function getCoreErrorMessage(result: CoreCallResult | null, fallback = 'Core request failed.'): string {
  const envelope = extractEnvelope<unknown>(result);
  const envelopeMessage = envelope?.error?.message;

  if (typeof envelopeMessage === 'string' && envelopeMessage.trim().length > 0) {
    return envelopeMessage;
  }

  if (typeof result?.error?.message === 'string' && result.error.message.trim().length > 0) {
    return result.error.message;
  }

  if (typeof result?.statusText === 'string' && result.statusText.trim().length > 0) {
    return result.statusText;
  }

  return fallback;
}

export function getPlayerKey(player: PlayerEntry): string {
  const playfabId = player.playfabId.trim()
  return playfabId && playfabId.toUpperCase() !== 'NULL'
    ? playfabId
    : `${player.index}-${player.eosPlayerId ?? ''}-${player.name}`
}

export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? 'null';
}

function emptyListPlayersData(): ListPlayersData {
  return {
    rawText: '',
    players: [],
    rawLines: [],
    parseWarnings: []
  };
}

function getPlayers(source: JsonRecord): PlayerEntry[] {
  const value = source.players ?? source.Players;

  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(normalizePlayer).filter((player): player is PlayerEntry => player !== null);
}

function normalizePlayer(value: unknown, arrayIndex: number): PlayerEntry | null {
  // TEMP COMMENT
  if (!isRecord(value)) {
    return null;
  }

  const name = getString(value, 'name') ?? getString(value, 'Name');
  const playfabId =
    getString(value, 'playfabId') ??
    getString(value, 'playFabId') ??
    getString(value, 'PlayfabId') ??
    getString(value, 'PlayFabId') ??
    getString(value, 'playFabPlayerId') ??
    getString(value, 'PlayFabPlayerId');

  if (!name || !playfabId) {
    return null;
  }

  return {
    index: getNumber(value, 'index') ?? getNumber(value, 'Index') ?? arrayIndex,
    name,
    playfabId,
    rawLine: getString(value, 'rawLine') ?? getString(value, 'RawLine') ?? name,
    eosPlayerId: getString(value, 'eosPlayerId') ?? getString(value, 'EosPlayerId'),
    score: getNumber(value, 'score') ?? getNumber(value, 'Score'),
    kills: getNumber(value, 'kills') ?? getNumber(value, 'Kills'),
    deaths: getNumber(value, 'deaths') ?? getNumber(value, 'Deaths'),
    pingMs: getNumber(value, 'pingMs') ?? getNumber(value, 'PingMs')
  };
}

function getString(source: JsonRecord, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function getNumber(source: JsonRecord, key: string): number | null {
  const value = source[key];

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getStringArray(source: JsonRecord, key: string): string[] | null {
  const value = source[key];

  if (!Array.isArray(value)) {
    return null;
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
