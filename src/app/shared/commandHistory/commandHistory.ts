export type ConsoleSubmission = Readonly<{
  sequence: number
  command: string
  submittedAtUtc: string
  ageMs: number
  actionId: string
  commandIndex: number
  author: `user` | `system`
  appProcessId: number
  gameProcessId: number
}>

export type CommandHistoryRow = Readonly<{
  id: number
  index: number
  command: string
  action: string
  info: string
  origin: `unknown` | `pending` | `spellbook` | `external`
  reason: string
  observedAtUtc: number | null
  submission: ConsoleSubmission | null
}>

export type CommandHistoryState = Readonly<{
  reporting?: CommandReportingState
  revision: number
  status: `inactive` | `waiting` | `monitoring` | `recovering` | `unavailable` | `incompatible`
  rows: readonly CommandHistoryRow[]
  total: number
  updatedAtUtc: number | null
  error: string
  resetReason: string
}>

export type CommandReportingState = {
  pending: number
  evicted: number
  error: string
  rows: Record<string, { status: `pending` | `recorded` | `retained` | `failed` | `duplicate` | `unreportable`, playerActionId: number | null, reason?: string }>
}

export const initialCommandHistoryState: CommandHistoryState = {
  revision: 0, status: `inactive`, rows: [], total: 0, updatedAtUtc: null, error: ``, resetReason: ``
}

export type CommandHistoryApi = {
  commandHistory(): Promise<CommandHistoryState>
  onCommandHistoryChanged(callback: (state: CommandHistoryState) => void): () => void
}
