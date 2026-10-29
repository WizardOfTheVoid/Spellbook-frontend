import type { PlayerSearchRequest } from '../../../shared/playerSearchRequest'
import type { AppUpdateApi } from '../../../shared/appUpdate'
import type { SnapshotLookupEvent } from '@spellbook/shared/snapshotLookup'
export type { SnapshotLookupEvent } from '@spellbook/shared/snapshotLookup'
import type { MaintenanceApi } from '../../../shared/maintenance'
export type { PlayerSearchRequest } from '../../../shared/playerSearchRequest'
import type { ActionRecipe, ActionTarget, ActionContext, PreparedAction } from '@spellbook/shared/actions/actionTypes'
import type { CommandProvenance } from '@spellbook/shared/commandObservations'
import type { ToastRequest } from '../../../shared/notificationToast'
import type { TeamServerClaimsInput } from '@spellbook/shared/teamServers.js'
export type { ToastRequest } from '../../../shared/notificationToast'
import type { GameServerListQueryInput } from '@spellbook/shared/gameServerListQuery.js'
import type { PlayerPresence } from '@spellbook/shared/playerPresence.js'
import type { ServerProfileActionIconKey } from '@spellbook/shared/serverProfileActionIcons.js'
import type { NotificationTone } from '@spellbook/shared/notifications.js'
import type { DiscordInstallResult } from '../../../shared/discordInstall.js'
import type { ConsoleKeyCode } from '../../../shared/consoleKey'
import type { ShortcutKeyCode } from '../../../shared/keybinds'
import type { TrayDestination } from '../../../shared/trayNavigation'
import type { ConsoleSetupApi } from '../../../shared/consoleSetup'
import type { GameStateApi } from '../../../shared/gameState'
import type { CommandHistoryApi } from '../../../shared/commandHistory/commandHistory'
import type { PendingPlayerLink } from '@spellbook/shared/appLinks'
import type { TeamVariable, VariableDefinition } from '@spellbook/shared/teamVariables'
export type { GameServerListQueryInput } from '@spellbook/shared/gameServerListQuery.js'
export type { ServerProfileActionIconKey } from '@spellbook/shared/serverProfileActionIcons.js'
export type { DiscordInstallResult } from '../../../shared/discordInstall.js'

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

export type ChivCoreApi = ConsoleSetupApi & GameStateApi & CommandHistoryApi & {
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
  inputConfig: () => Promise<CoreCallResult>
  executeProfileRecipe: (payload: { recipe: ActionRecipe, target: ActionTarget, context: ActionContext, gameServerId: number }) => Promise<{ result: CoreCallResult, prepared: PreparedAction | null }>
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
  releaseCreationEnabled: boolean
  onboardingComplete: boolean;
};

export type ChivAuthApi = {
  openHelp: (destination?: `discord` | `guide` | `website`) => Promise<void>
  login: () => Promise<CoreCallResult>;
  session: () => Promise<CoreCallResult>;
  updateProfile: (profile: { displayName: string; playfabId: string }) => Promise<CoreCallResult>;
  logout: () => Promise<CoreCallResult>;
  onSessionChange: (callback: (result: CoreCallResult) => void) => () => void;
};

export type ProfileOwner = { type: 'user' | 'team'; id: number };
export type SystemProfileOwner = { type: 'system'; id: 0 };
export type ServerProfileOwner = ProfileOwner | SystemProfileOwner;
export type ProfileOwnerOption = ProfileOwner & { name: string; permissions: string[]; isMember?: boolean };
export type TeamRecord = { id: number; ownerUserId: number; name: string; permissions: string[]; logo?: string | null; isMember?: boolean };
export type TeamListRecord = TeamRecord & { memberCount: number; claimedServerCount: number; profileCount: number; pendingRequestCount?: number }
export type TeamDirectoryEntry = { id: number, name: string, pending: boolean, member: boolean }
export type TeamJoinRequest = { userId: number, displayName: string, username: string, requestedAt: string }
export type DiscordTeamConnection = { guildId: string; guildName: string }
export type UserTeamSummary = Pick<TeamRecord, `id` | `name`>
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
  releaseCreationEnabled: boolean
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

export type ChivOverlayApi = AppUpdateApi & {
  pendingAppLink: () => Promise<PendingPlayerLink | null>
  acknowledgeAppLink: (sequence: number) => Promise<boolean>
  onAppLinkChanged: (callback: () => void) => () => void
  onHistoryNavigate: (callback: (direction: `back` | `forward`) => void) => () => void
  onNavigate: (callback: (destination: TrayDestination) => void) => () => void
  isVisible: () => Promise<boolean>;
  notificationPollMs: () => Promise<number>
  focusState: () => Promise<OverlayFocusState>;
  hide: () => Promise<void>;
  show: () => Promise<void>;
  setModalOpen: (open: boolean) => Promise<void>
  setTextInputActive: (active: boolean) => void
  showToast: (request: ToastRequest) => Promise<boolean>;
  hideToast: (group?: string) => Promise<void>
  resizeToast: (height: number) => void
  activateToastAction: (id: number) => Promise<void>
  onToastAction: (callback: (id: number) => void) => () => void
  getSettings: () => Promise<AppSettingsSnapshot>;
  updateSettings: (update: AppSettingsUpdate) => Promise<AppSettingsSnapshot>;
  setKeybindRecording: (recording: boolean) => Promise<void>
  debugLog: (scope: string, message: string) => void;
  onSnapshotLookup: (callback: (event: SnapshotLookupEvent) => void) => () => void;
  onToast: (callback: (request: ToastRequest) => void) => () => void;
  onVisibilityChange: (callback: (visible: boolean) => void) => () => void;
};

export type AppSettings = {
  debug: boolean
  audioSfxEnabled: boolean;
  audioSfxVolume: number;
  selectedDisplayId: number | null;
  consoleKey: ConsoleKeyCode | null
  overlayKey: ShortcutKeyCode
  quickOpenPlayerKey: ShortcutKeyCode
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

export type ActiveBanKind = "hacker" | "other"

export type PlayerPunishmentSummary = {
  id: number
  actionType: 'ban' | 'kick' | 'warn'
  offenseType: string | null
  reason: string | null
  createdAt: string
  expiresAt: string | null
}

export type DbPlayerListItem = {
  evidenceCount?: number
  isWanted?: boolean
  id: number;
  playfabId: string;
  rank?: number | null;
  latestName?: string | null;
  latestNormalizedName?: string | null;
  matchedAlias?: string | null
  names?: string[]
  rosterFacts?: { offenseCount: number; accountCreatedAt: string | null }
  lastLogin: string | null
  playtimeHours: number | null
  activeBanKind: ActiveBanKind | null
  activeBan?: PlayerPunishmentSummary | null
  latestPunishment?: PlayerPunishmentSummary | null
  strongestRecentPunishment?: PlayerPunishmentSummary | null
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
  live?: import('@spellbook/shared/serverStore').ServerLiveSummary
  geoLatitude: number | null
  geoLongitude: number | null
  geoAccuracyRadiusKm: number | null
  geoCountryCode: string | null
  geoCity: string | null
  geoTimezone: string | null
  geoSource: string | null
  geoCheckedAt: string | null
  ownerTeamId: number | null
  a2s?: import('@spellbook/shared/gameServerA2s').GameServerA2sData
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
  observedAt: string
}

export type GameServerProfile = {
  live?: import('@spellbook/shared/serverStore').ServerLiveSummary
  ownerTeamId?: number | null
  ownerTeam?: import('@spellbook/shared/gameServerOverview').ServerOwnerTeam | null
  gameServer: GameServerRecord & { tornBannerRaw: unknown }
  playerCounts: GameServerPlayerCountRecord[]
  assignment: ServerProfileAssignment | null
  canEditDetails: boolean
  canViewSettings: boolean
  canViewPlayers: boolean
}

export type GameServerPlayers = {
  roster: import('@spellbook/shared/serverStore').ServerLiveRoster
  players: DbPlayerListItem[]
}

export type GameServerPatch = {
  displayName?: string | null
}

export type ServerVariableDefinition = VariableDefinition

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
export type PlayerActionType = "ban" | "kick" | "warn" | "unban" | "mock";
export type PlayerActionScope = "local" | "global"
export type PlayerActionCreationType = "manual" | "auto"
export type PlayerNoteScope = "me" | "admins" | "public"
export type ServerProfileCommandType = import('@spellbook/shared/actions/actionTypes').ActionCommandType
export type CoreBatchCommandType = Exclude<ServerProfileCommandType, `incremental_ban`>
export type ServerProfileActionDomain = "player" | "server";

export type CoreBatchCommand = {
  commandType: CoreBatchCommandType
  message: string
  delayMs: number
  playfabId?: string
  hours?: number
}

export type PlayerDbProfile = {
  spellbookRole?: `admin` | `creator` | null
  isTeammate?: boolean
  presence?: PlayerPresence | null
  player: DbPlayerListItem & { playfab: PlayerPlayFabData, profileVisitCount?: number };
  names: Array<{ id: number; playerId: number; name: string; normalizedName: string; lastSeen: string }>;
  meta: Array<{ id: number; playerId: number; key: string; value: string; createdAt?: string | null }>;
  actions: PlayerAction[]
  noteCount: number
};

export type PlayerAction = {
  commandProvenance?: CommandProvenance[]
  removedAt?: string | null
  isActiveBan?: boolean
  creditedTeam?: { id: number, name: string | null } | null
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
  actionOrigin?: `local` | `request` | `rule` | `wanted`
  isAutomated?: boolean
  creationType?: PlayerActionCreationType
  originalActionId: number | null
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: { id: number; displayName?: string | null; username: string | null; playfabId: string | null };
  gameServer: { id: number; name: string | null; displayName: string | null } | null;
};

export type PlayerNoteUserReference = {
  id: number
  username: string
  displayName: string
  isActive: boolean
  bannedAt: string | null
}

export type PlayerNotePlayerReference = { id: number, playfabId: string, latestName?: string | null }

export type PlayerNote = {
  id: number
  playerId: number
  author: { id: number, displayName?: string | null, username: string | null, playfabId: string | null, avatarUrl?: string | null }
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
    author: { id: number; displayName?: string | null; username: string | null; playfabId: string | null } | null
    wantedAt: string
    originalActionId: number | null
    actionType: `ban` | `unban` | `mock` | null
    originServer: { id: number; name: string | null; displayName: string | null } | null
    completedServerCount: number
    targetServerCount: number | null
  }
}

export type WantedDetail = {
  presence?: PlayerPresence | null
  source?: string | null
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

export type EvidenceSelectedFile = {
  id: string
  name: string
  kind: `image` | `video`
  size: number
  originalSha256: string | null
}

export type { EvidenceProgress, EvidenceUploadProgress } from '../../../shared/evidenceProgress'

export type EvidenceDuplicate = {
  id: number
  playerId: number
  playfabId: string
  createdAt: string
  evidenceUrl: string
}

export type EvidenceDuplicateCheck = { count: number, matches: EvidenceDuplicate[] }

export type EvidenceItem = {
  id: number
  offenseIds?: number[]
  viewCount?: number
  commentCount?: number
  playerId: number
  playfabId: string
  nickname: string | null
  type: `cheating`
  subtypes: string[]
  createdAt: string
  authorName: string
  duplicateCount: number
  author?: { id: number, displayName?: string | null, username: string | null }
  duplicates: EvidenceDuplicate[]
  file: {
    kind: `image` | `video`
    mimeType: string
    byteSize: number
    width: number
    height: number
    durationMs: number | null
    url: string
    thumbnailSmallUrl?: string | null
    thumbnailLargeUrl?: string | null
  }
  evidenceUrl: string
  embedUrl: string
  wantedUrl: string
  playerUrl: string
  isWanted: boolean
  candidateId: number | null
  reviewStatus?: `wanted` | `candidate`
}

export type CandidatePlayerListItem = DbPlayerListItem & {
  candidateId: number
  revision: number
  evidenceCount: number
  lastEvidenceAt: string
}

export type WantedCandidate = {
  id: number
  createdBy: number | null
  playerId: number
  status: `pending` | `accepted` | `rejected`
  revision: number
  evidenceCount: number
  firstEvidenceAt: string
  lastEvidenceAt: string
  reviewedBy: number | null
  reviewedAt: string | null
  reviewNote: string | null
}

export type WantedCandidateDetail = {
  candidate: WantedCandidate & { creatorName: string }
  player: DbPlayerListItem
  evidence: EvidenceItem[]
}

export type EvidenceComment = {
  id: number
  evidenceId: number
  authorId: number
  authorName: string
  author?: { id: number, displayName?: string | null, username: string | null, avatarUrl?: string | null }
  body: string
  createdAt: string
  positionMs?: number | null
  actionReferences: PlayerAction[]
  userReferences: PlayerNoteUserReference[]
  playerReferences: PlayerNotePlayerReference[]
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
  incrementalBan?: import('@spellbook/shared/actions/incrementalBan').IncrementalBan | null
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
  actionKey?: string
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
  showInGameServerActions?: boolean
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
  isMaster?: boolean
  isPreset?: boolean
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ServerProfileGraph = {
  profile: ServerProfileRecord;
  servers: ServerProfileServer[];
  actions: ServerProfileAction[];
  availableVariables: ServerVariableDefinition[]
};

export type ServerProfilePresetSummary = Pick<ServerProfileRecord, `id` | `name` | `description`>
export type ServerProfileSource = {
  profile: ServerProfilePresetSummary
  actions: ServerProfileAction[]
}

export type ServerProfileSummary = {
  isEnabledForUser?: boolean
  profile: ServerProfileRecord;
  serverCount: number;
  serverIds: number[];
  actionCount: number;
  enabledActionCount: number;
  ruleCount: number
  enabledRuleCount: number
  commandCount: number;
};

export type TickAction = `leaderboard` | `servers` | `cleanup` | `normalizePlayerNames` | `enrichEmptyPlayers` | `playerSearch`
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
  searchIndex?: import('@spellbook/shared/playerSearchStatus').PlayerSearchIndexStatus
}

const tickActionDefinitions = [
  { action: 'leaderboard', label: 'Leaderboard', supportsPause: true },
  { action: 'servers', label: 'Servers', supportsPause: false },
  { action: `cleanup`, label: `Cleanup`, supportsPause: false },
  { action: `normalizePlayerNames`, label: `Norrmalize player names`, supportsPause: false },
  { action: `enrichEmptyPlayers`, label: `Enrich existing empty players`, supportsPause: false },
  { action: `playerSearch`, label: `Player search index`, supportsPause: false }
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

export type ActiveServerProfile = import('@spellbook/shared/actions/actionExecutionAccess').ActionExecutionAccess & {
  ownerTeamId?: number | null
  source: "assigned" | "default";
  gameServer: ActiveGameServer | null;
  profile: ServerProfileGraph;
  profiles?: ServerProfileGraph[]
  variables: TeamVariable[]
};

export type ServerProfileGraphInput = {
  isPreset?: boolean
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
  removeOffense?: boolean
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
  source?: string
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
  forensics: { alt: { vectors: () => Promise<CoreCallResult>, ping: (playerId: number) => Promise<CoreCallResult>, triangulate: (playerId: number) => Promise<CoreCallResult> } }
  maintenance: MaintenanceApi
  evidence: {
    select: () => Promise<EvidenceSelectedFile[]>
    release: (ids: string[]) => Promise<unknown>
    onProgress: (callback: (progress: import('../../../shared/evidenceProgress').EvidenceUploadProgress) => void) => () => void
    checkDuplicates: (originalByteSize: number, originalSha256: string) => Promise<CoreCallResult>
    upload: (input: { fileId: string, playerId?: number, playfabId?: string, nicknameId: number | null, subtypes: string[] }) => Promise<CoreCallResult>
    list: (playerId: number) => Promise<CoreCallResult>
    get: (evidenceId: number) => Promise<CoreCallResult>
    byToken: (token: string) => Promise<CoreCallResult>
    offenses: (evidenceId: number, offenseIds: number[]) => Promise<CoreCallResult>
    view: (evidenceId: number, sessionId: string, watchedMs: number) => Promise<CoreCallResult>
    comments: (evidenceId: number) => Promise<CoreCallResult>
    comment: (evidenceId: number, body: string, positionMs?: number | null) => Promise<CoreCallResult>
    delete: (evidenceId: number) => Promise<CoreCallResult>
    deleteComment: (evidenceId: number, commentId: number) => Promise<CoreCallResult>
  }
  actions: (operation: string, input?: unknown) => Promise<CoreCallResult>
  dashboard: {
    get: (query: import('@spellbook/shared/dashboard.js').DashboardQuery) => Promise<CoreCallResult>
    timeline: (query: import('@spellbook/shared/dashboard.js').DashboardTimelineQuery) => Promise<CoreCallResult>
  }
  getPlayers: (query?: PlayerListQuery, request?: PlayerSearchRequest) => Promise<CoreCallResult>;
  cancelPlayerSearch?: (request: PlayerSearchRequest) => Promise<void>
  enrichPlayers: (playfabIds: string[]) => Promise<CoreCallResult>
  getWantedPlayers: (query?: PlayerListQuery, request?: PlayerSearchRequest) => Promise<CoreCallResult>
  candidates: {
    list: (query?: PlayerListQuery, request?: PlayerSearchRequest) => Promise<CoreCallResult>
    get: (candidateId: number) => Promise<CoreCallResult>
    accept: (candidateId: number, expectedRevision: number, reviewNote: string) => Promise<CoreCallResult>
    reject: (candidateId: number, expectedRevision: number, reviewNote: string) => Promise<CoreCallResult>
  }
  wanted: {
    get: (playerId: number) => Promise<CoreCallResult>
    create: (input: WantedCreateInput) => Promise<CoreCallResult>
    revert: (playerId: number, sourceActionId: number) => Promise<CoreCallResult>
    remove: (playerId: number) => Promise<CoreCallResult>
  }
  notifications: {
    list: (afterId?: number, beforeId?: number, visibility?: import('@spellbook/shared/notifications.js').NotificationVisibility) => Promise<CoreCallResult>
    restore: (notificationId: number) => Promise<CoreCallResult>
    deleteAll: () => Promise<CoreCallResult>
    setRead: (notificationId: number, read: boolean) => Promise<CoreCallResult>
    markAllRead: () => Promise<CoreCallResult>
    delete: (notificationId: number) => Promise<CoreCallResult>
  }
  todo: () => Promise<CoreCallResult>
  profileOwners: (teamId?: number) => Promise<CoreCallResult>;
  admin: {
    discord: {
      guilds: () => Promise<CoreCallResult>
      latestRelease: () => Promise<CoreCallResult>
      queue: (beforeId?: number) => Promise<CoreCallResult>
      broadcast: (message: import('@spellbook/shared/discordBroadcasts.js').DiscordBroadcastMessage) => Promise<CoreCallResult>
      send: (message: import('@spellbook/shared/discordBroadcasts.js').DiscordBroadcastMessage & { guildId: string }) => Promise<CoreCallResult>
      broadcastRelease: (version: string) => Promise<CoreCallResult>
    }
    auditLogs: {
      list: (query?: AuditLogQuery) => Promise<CoreCallResult>
    }
    notificationTests: {
      create: (tone: NotificationTone) => Promise<CoreCallResult>
    }
    notifications: {
      send: (input: import('@spellbook/shared/notifications.js').AdminNotificationInput) => Promise<CoreCallResult>
    }
    users: {
      list: (params?: { limit?: number; offset?: number }) => Promise<CoreCallResult>;
      get: (userId: number) => Promise<CoreCallResult>;
      activity: (userId: number) => Promise<CoreCallResult>
      setWantedPermission: (userId: number, enabled: boolean) => Promise<CoreCallResult>
      setReleasePermission: (userId: number, enabled: boolean) => Promise<CoreCallResult>
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
    settings: (teamId: number) => Promise<CoreCallResult>
    saveSettings: (teamId: number, input: import('@spellbook/shared/teamSettings').TeamSettings) => Promise<CoreCallResult>
    guidelines: (teamId: number) => Promise<CoreCallResult>
    saveGuidelines: (teamId: number, input: import('@spellbook/shared/teamSettings').TeamGuidelines) => Promise<CoreCallResult>
    guidelineHistory: (teamId: number, before?: number) => Promise<CoreCallResult>
    pendingRequestCount: () => Promise<CoreCallResult>
    updateServers: (teamId: number, input: TeamServerClaimsInput) => Promise<CoreCallResult>
    directory: () => Promise<CoreCallResult>
    requestAccess: (teamId: number) => Promise<CoreCallResult>
    requests: (teamId: number) => Promise<CoreCallResult>
    invitations: (teamId: number) => Promise<CoreCallResult>
    cancelInvitation: (teamId: number, invitationId: number) => Promise<CoreCallResult>
    decideRequest: (teamId: number, userId: number, decision: `approve` | `reject`) => Promise<CoreCallResult>
    list: (all?: boolean) => Promise<CoreCallResult>;
    create: (name: string) => Promise<CoreCallResult>;
    delete: (teamId: number) => Promise<CoreCallResult>
    rename: (teamId: number, name: string) => Promise<CoreCallResult>
    transferOwnership: (teamId: number, userId: number) => Promise<CoreCallResult>
    members: (teamId: number) => Promise<CoreCallResult>;
    memberOptions: (teamId: number) => Promise<CoreCallResult>;
    addMember: (teamId: number, userId: number) => Promise<CoreCallResult>;
    decideInvitation: (teamId: number, invitationId: number, decision: import('@spellbook/shared/notifications.js').TeamInvitationDecision) => Promise<CoreCallResult>
    removeMember: (teamId: number, userId: number) => Promise<CoreCallResult>;
    setPermissions: (teamId: number, userId: number, permissions: string[]) => Promise<CoreCallResult>;
    discord: (teamId: number) => Promise<CoreCallResult>
    discordConfiguration: (teamId: number) => Promise<CoreCallResult>
    discordResources: (teamId: number) => Promise<CoreCallResult>
    saveDiscordConfiguration: (teamId: number, input: import('@spellbook/shared/discordConfiguration').DiscordConfigurationPatch) => Promise<CoreCallResult>
    installDiscord: (teamId: number) => Promise<CoreCallResult>
    unlinkDiscord: (teamId: number) => Promise<CoreCallResult>
    onDiscordInstallCompleted: (callback: (result: DiscordInstallResult) => void) => () => void
  };
  gameServers: {
    overview: (gameServerId: number, period: import('@spellbook/shared/gameServerOverview').ServerHistoryPeriod) => Promise<CoreCallResult>
    admins: (gameServerId: number, offset: number) => Promise<CoreCallResult>
    playerCounts: (gameServerId: number) => Promise<CoreCallResult>
    presence: (ids: number[]) => Promise<CoreCallResult>
    get: (gameServerId: number, query?: { a2s?: boolean, view?: `live` }) => Promise<CoreCallResult>
    players: (gameServerId: number) => Promise<CoreCallResult>
    list: (query?: GameServerListQueryInput) => Promise<CoreCallResult>;
    filterOptions: () => Promise<CoreCallResult>;
    update: (gameServerId: number, patch: GameServerPatch) => Promise<CoreCallResult>;
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
  visitPlayerProfileByPlayfab: (playfabId: string) => Promise<CoreCallResult>
  playerProfileByPlayfab: (playfabId: string) => Promise<CoreCallResult>;
  playerTimeline: (playerId: number, limit?: number, before?: string) => Promise<CoreCallResult>
  refreshPlayerProfileByPlayfab: (playfabId: string) => Promise<CoreCallResult>;
  serverProfiles: {
    presets: () => Promise<CoreCallResult>
    preset: (profileId: number) => Promise<CoreCallResult>
    setEnabled: (owner: ProfileOwner, profileId: number, isEnabled: boolean) => Promise<CoreCallResult>
    list: (owner: ProfileOwner) => Promise<CoreCallResult>;
    assignments: () => Promise<CoreCallResult>;
    active: (externalId?: string | null) => Promise<CoreCallResult>;
    get: (owner: ProfileOwner, profileId: number) => Promise<CoreCallResult>;
    create: (owner: ProfileOwner, input: ServerProfileGraphInput) => Promise<CoreCallResult>;
    update: (owner: ProfileOwner, profileId: number, input: ServerProfileGraphInput) => Promise<CoreCallResult>;
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

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
