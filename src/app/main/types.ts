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

export type TimedCallResult = {
  result: CoreCallResult;
  latencyMs: number;
};

export type CommandPayload = {
  command?: unknown;
  expectClipboard?: unknown;
  restoreClipboard?: unknown;
};

export type MessagePayload = {
  kind: 'admin' | 'server'
  message: string
}

export type AntiAfkPayload = {
  enabled?: unknown
}

export type ModerationPayload = {
  playfabId?: unknown;
  reason?: unknown;
  hours?: unknown;
  message?: unknown;
};

export type CoreBatchCommand = {
  commandType: 'server_message' | 'warn' | 'kick' | 'ban' | 'unban'
  message: string | null
  delayMs: number
  playfabId?: string
  hours?: number | null
}

export type CommandBatchPayload = {
  commands?: CoreBatchCommand[]
}

export type ServerPlayersPayload = {
  page?: unknown;
  include?: unknown;
  search?: unknown;
  isOnline?: unknown;
  active?: unknown
  minRank?: unknown;
  maxRank?: unknown;
  minOffenses?: unknown;
  minPlaytimeHours?: unknown;
  maxPlaytimeHours?: unknown;
  newAccounts?: unknown;
  banned?: unknown;
  sortBy?: unknown;
  sortOrder?: unknown;
  createdAfter?: unknown;
  createdBefore?: unknown;
};

export type ListPlayersSnapshotPlayer = {
  index: number;
  name: string;
  playfabId: string;
  rawLine: string;
  eosPlayerId?: string | null;
  score?: number | null;
  kills?: number | null;
  deaths?: number | null;
  pingMs?: number | null;
};

export type ListPlayersSnapshot = {
  serverName?: string | null;
  normalizedServerName?: string | null;
  serverIp?: string | null;
  serverPort?: number | null;
  serverAddress?: string | null;
  rawText: string;
  rawLines: string[];
  parseWarnings: string[];
  players: ListPlayersSnapshotPlayer[];
};

export type FocusState = {
  gameIsFocused: boolean;
  overlayIsFocused: boolean;
  checkedAt: string;
  coreReachable: boolean;
  coreStatus: number;
  error?: string;
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
  level: 'success' | 'error' | 'warning' | 'info';
  durationMs?: number;
};

export type JsonRecord = Record<string, unknown>;

export type CoreRestoreTarget = {
  processId: number
  windowHandle: `0x${string}`
}

export type CoreRestoreTargetPayload = {
  restoreTarget: CoreRestoreTarget
}
