import type { CoreAction, CoreActionAuthor, CoreActionPriority, CoreCommand } from './coreAction'
import type { CoreStatusSnapshot } from './gameActivity'

export type DebugEvent = {
  sequence: number
  timeMs: number
  kind: string
  message: string
  actionId?: string | null
  commandIndex?: number | null
  slot?: number | null
}

export type DebugQueueAction = {
  id: string
  key: string
  author: CoreActionAuthor
  priority: CoreActionPriority
  cursor: number
  keyCursor?: number
  commandCount: number
  remainingMs: number
  state: string
  reason?: string | null
  commands: CoreCommand[]
}

export type CoreDebugSnapshot = {
  cpuPercent?: number | null
  status: CoreStatusSnapshot
  sequence: number
  events: DebugEvent[]
  eventsLost: boolean
  armed: boolean
  queue: { paused: boolean, actions: DebugQueueAction[] }
  execution: { phase: string, actionId?: string | null, commandIndex?: number | null }
  ordinaryGate?: { canExecuteCommand: boolean, reason?: string | null }
  input: { heldKeys: number[], heldButtons: number[], injectedKeyboardEvents: number, injectedMouseEvents: number }
  windows: { game: Record<string, unknown>, app: Record<string, unknown> }
  settings: Record<string, number>
}

export type DebugPreset = {
  slot: number
  label: string
  instruction: string
  author: CoreActionAuthor
  priority: CoreActionPriority
  commands: CoreCommand[]
  repeat: number | `infinite`
  intervalMs: number
  startDelayMs: number
  identity: `matching` | `distinct`
}

export type DebugPanelName = `tests` | `queue` | `state` | `events`
export type DebugPanelLayout = { visible: boolean, x: number, y: number, scale: number, opacity: number }
export type DebugLayout = Record<DebugPanelName, DebugPanelLayout>
export type DebugProducer = `listPlayers` | `wanted` | `antiAfk`
export type DebugQueueOperation = `pause` | `resume` | `step` | `cancel` | `stop`
export type DebugRun = {
  id: string
  slot: number
  label: string
  startedAt: number
  request: CoreAction
  state: string
  result?: unknown
}

export type DebugSessionSnapshot = {
  hudVisible?: boolean
  appCpuPercent?: number | null
  enabled: boolean
  armed: boolean
  recording: boolean
  selectedSlot: number | null
  presets: DebugPreset[]
  layout: DebugLayout
  pausedProducers: Record<DebugProducer, boolean>
  core: CoreDebugSnapshot | null
  runs: DebugRun[]
  scheduled?: { slot: number, remaining: number | `infinite`, nextRunAt: number }[]
  events: DebugEvent[]
  error: string | null
}

export type DebugControlApi = {
  getState(): Promise<DebugSessionSnapshot>
  setArmed(armed: boolean): Promise<void>
  run(slot: number): Promise<void>
  stop(): Promise<void>
  savePreset(preset: DebugPreset): Promise<void>
  resetPresets(): Promise<void>
  preview(preset: DebugPreset): Promise<CoreAction>
  queue(operation: DebugQueueOperation, id?: string): Promise<void>
  setProducerPaused(producer: DebugProducer, paused: boolean): Promise<void>
  configure(layout: DebugLayout): Promise<void>
  settings(values: Record<string, number>, save?: boolean, reset?: boolean): Promise<void>
  record(enabled: boolean): Promise<void>
  mark(label: string): Promise<void>
  exportRecording(): Promise<string | null>
  onState(callback: (state: DebugSessionSnapshot) => void): () => void
}
