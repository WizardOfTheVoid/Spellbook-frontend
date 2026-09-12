import type { ListPlayersSnapshotPlayer } from '../types'

export type CurrentGameSnapshot = Readonly<{
  version: number
  observedAt: string
  gameServerId: number
  externalId: string
  serverName: string | null
  serverAddress: string | null
  players: readonly Readonly<ListPlayersSnapshotPlayer>[]
  parseWarnings: readonly string[]
}>

export type CurrentGameSnapshotInput = {
  observedAt: string
  gameServerId: number
  externalId: string
  serverName: string | null
  serverAddress: string | null
  players: ListPlayersSnapshotPlayer[]
  parseWarnings: string[]
}

type SnapshotListener = (snapshot: CurrentGameSnapshot | null) => void

export class CurrentGameSnapshotStore {
  private snapshot: CurrentGameSnapshot | null = null
  private version = 0
  private readonly listeners = new Set<SnapshotListener>()

  constructor(private readonly now: () => Date = () => new Date()) {}

  get(): CurrentGameSnapshot | null {
    return this.snapshot
  }

  getNewerThan(version: number, gameServerId: number): CurrentGameSnapshot | null {
    return this.snapshot?.gameServerId === gameServerId && this.snapshot.version > version
      ? this.snapshot
      : null
  }

  replace(input: CurrentGameSnapshotInput): CurrentGameSnapshot {
    const players = Object.freeze(input.players.map(player => Object.freeze({ ...player })))
    const parseWarnings = Object.freeze([...input.parseWarnings])
    const snapshot = Object.freeze({
      version: ++this.version,
      observedAt: this.observedAt(input.observedAt),
      gameServerId: input.gameServerId,
      externalId: input.externalId,
      serverName: input.serverName,
      serverAddress: input.serverAddress,
      players,
      parseWarnings
    })

    this.snapshot = snapshot
    this.publish(snapshot)
    return snapshot
  }

  clear(): void {
    this.snapshot = null
    this.publish(null)
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private publish(snapshot: CurrentGameSnapshot | null): void {
    for (const listener of this.listeners) listener(snapshot)
  }

  private observedAt(value: string): string {
    const observedAt = new Date(value)
    return Number.isFinite(observedAt.getTime()) ? observedAt.toISOString() : this.now().toISOString()
  }
}
