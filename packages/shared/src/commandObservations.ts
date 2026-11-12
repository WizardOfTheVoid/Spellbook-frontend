export type CommandObservationOrigin = `external` | `spellbook` | `unknown`

export type CommandObservationInput = {
  id: string
  clientId: string
  command: string
  observedAtUtc: string
  binding: { gameServerId: number, generation: number }
  origin: CommandObservationOrigin
  followingCommands?: string[]
}

export type CommandObservationResult = {
  id: string
  status: `recorded` | `retained` | `duplicate`
  playerActionId: number | null
}

export type CommandProvenance = {
  id: string
  actorId: number
  origin: CommandObservationOrigin
  command: string
  observedAtUtc: string
}

export type ObservedPlayerCommand = {
  kind: `player`
  actionType: `ban` | `kick` | `unban`
  playfabId: string
  duration: number | null
  reason: string | null
}

export type ParsedObservedCommand = ObservedPlayerCommand
  | { kind: `message`, messageKind: `serversay` | `adminsay`, message: string }
  | { kind: `unsupported` }
