import type { CurrentGameSnapshot } from "../core"

export class CurrentGameSnapshotGate {
  private eventReceived = false
  private clearedByEvent = false
  latestVersion = 0

  acceptHydration(snapshot: CurrentGameSnapshot | null): boolean {
    if (this.clearedByEvent) return false
    if (!snapshot) return !this.eventReceived
    if (this.eventReceived && snapshot.version <= this.latestVersion) return false

    this.latestVersion = Math.max(this.latestVersion, snapshot.version)
    return true
  }

  acceptEvent(snapshot: CurrentGameSnapshot | null): boolean {
    this.eventReceived = true
    if (!snapshot) {
      this.clearedByEvent = true
      return true
    }
    if (snapshot.version <= this.latestVersion) return false

    this.latestVersion = snapshot.version
    return true
  }
}

export function formatServerPlayerCount(currentPlayers: number, maxPlayers: number | null): string {
  return `(${currentPlayers}/${maxPlayers ?? `?`})`
}
