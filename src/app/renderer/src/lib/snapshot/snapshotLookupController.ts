import type { SnapshotLookupEvent, SnapshotLookupDiagnostics } from '@spellbook/shared/snapshotLookup'
import type { ChivOverlayApi } from '$lib/core'
import type { PlayerState } from '$lib/types/playerState'

type Match = NonNullable<SnapshotLookupEvent[`match`]>
type LookupCue = `play` | `recording` | `purchase` | `sleep`
type PlayingSound = { stop(): void }
type LookupContext = {
  user: object | null
  connectionGeneration: number
  gameServerId: number | undefined
  available: boolean
  players: readonly Pick<PlayerState, `playfabId` | `isOnline`>[]
}
type LookupDependencies = {
  api: Pick<ChivOverlayApi, `onSnapshotLookup` | `show` | `showToast` | `hideToast`>
  resolvePlayer(match: Match): Promise<PlayerState | null>
  context(): LookupContext
  onMatch(player: PlayerState, isCurrent: () => boolean): Promise<boolean>
  play(cue: LookupCue): PlayingSound | null | void
  record(diagnostics: SnapshotLookupDiagnostics): void
}

export class SnapshotLookupController {
  private requestId: string | null = null
  private completed = false
  private loadingTimer: ReturnType<typeof setTimeout> | null = null
  private loadingSound: PlayingSound | null = null

  constructor(private readonly dependencies: LookupDependencies) {}

  listen(): () => void {
    const unsubscribe = this.dependencies.api.onSnapshotLookup(event => void this.handle(event))
    return () => {
      this.requestId = null
      this.stopLoading()
      unsubscribe()
    }
  }

  private async handle(event: SnapshotLookupEvent): Promise<void> {
    if (event.phase === `started`) {
      if (this.requestId === event.requestId) return
      this.stopLoading()
      this.requestId = event.requestId
      this.completed = false
      this.play(`play`)
      this.loadingTimer = setTimeout(() => {
        this.loadingTimer = null
        this.loadingSound = this.play(`recording`) ?? null
      }, 1000)
      return
    }
    if (event.requestId !== this.requestId || this.completed) return
    this.completed = true
    this.stopLoading()
    try {
      const { user, connectionGeneration } = this.dependencies.context()
      const current = () => {
        const latest = this.dependencies.context()
        return this.requestId === event.requestId && !!event.match && user !== null
          && latest.available && latest.user === user && latest.connectionGeneration === connectionGeneration
          && latest.gameServerId === event.match.gameServerId
          && latest.players.some(player => player.isOnline && player.playfabId === event.match?.playfabId)
      }
      if (event.diagnostics) this.dependencies.record(event.diagnostics)
      if (!event.ok || !event.match) {
        this.play(`sleep`)
        await this.toast(event.error ?? `Player lookup failed. Please try again.`)
        return
      }
      const player = await this.dependencies.resolvePlayer(event.match)
      if (!current()) return
      if (!player) {
        this.play(`sleep`)
        await this.toast(`That player is no longer available. Please try again.`)
        return
      }
      await this.dependencies.api.show()
      if (current() && await this.dependencies.onMatch(player, current) && current()) {
        try { await this.dependencies.api.hideToast(`snapshotLookup`) } catch { /* Feedback is best effort. */ }
        if (current()) this.play(`purchase`)
      }
    } catch {
      if (this.requestId === event.requestId) {
        this.play(`sleep`)
        await this.toast(`Could not open the player. Please try again.`)
      }
    }
  }

  private play(cue: LookupCue): PlayingSound | null | void {
    try { return this.dependencies.play(cue) } catch { /* Audio is optional. */ }
  }

  private stopLoading(): void {
    if (this.loadingTimer !== null) clearTimeout(this.loadingTimer)
    this.loadingTimer = null
    try { this.loadingSound?.stop() } catch { /* Audio is optional. */ }
    this.loadingSound = null
  }

  private async toast(message: string): Promise<void> {
    try { await this.dependencies.api.showToast({ message, level: `error`, group: `snapshotLookup` }) } catch { /* Feedback is best effort. */ }
  }
}
