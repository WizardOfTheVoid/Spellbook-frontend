import { once } from 'node:events'
import type { PlayerDetectionResult, SnapshotLookupDiagnostics, SnapshotLookupEvent } from '@spellbook/shared/snapshotLookup'
import type { ServerLiveRoster } from '@spellbook/shared/serverStore'
import type { HttpClient } from '../api/http-client'
import { ResponseParser } from '../api/response-parser'
import type { RequestIdFactory } from '../request-id-factory'
import type { OverlayWindowController } from '../window/overlay-window-controller'
import type { CoreCallResult } from '../types'
import type { CurrentGameSnapshotStore } from './currentGameSnapshotStore'

type RosterPreparation = {
  clientId: string
  refresh(signal: AbortSignal): Promise<CoreCallResult>
  setLoading(loading: boolean): void
}

export class SnapshotLookupService {
  private isRunning = false
  private lastStartedAt = -Infinity

  constructor(
    private readonly httpClient: Pick<HttpClient, `callCore` | `getServer` | `postServer` | `authenticatedEpoch`>,
    private readonly overlayWindow: Pick<OverlayWindowController, `sendToCurrent`>,
    private readonly requestIds: Pick<RequestIdFactory, `next`>,
    private readonly snapshots: Pick<CurrentGameSnapshotStore, `get` | `invalidationVersion`>,
    private readonly inGame: () => boolean,
    private readonly roster: RosterPreparation
  ) {}

  async run(): Promise<void> {
    const now = Date.now()
    if (this.isRunning || now - this.lastStartedAt < 2000) return
    this.lastStartedAt = now
    this.isRunning = true
    const started = performance.now()
    const diagnostics: SnapshotLookupDiagnostics = {
      requestId: this.requestIds.next(`playerDetection`), startedAt: new Date().toISOString(),
      totalMs: 0, captureMs: 0, rosterMs: 0, requestMs: 0, inferenceMs: null, costUsd: null,
      inputTokens: null, confidence: null, margin: null, playerName: null, outcome: `failed`
    }
    let event: SnapshotLookupEvent = { requestId: diagnostics.requestId, phase: `finished`, ok: false }
    const cancellation = new AbortController()
    const timeout = setTimeout(() => cancellation.abort(new Error(`Player lookup took too long. Please try again.`)), 6000)
    try {
      const match = await Promise.race([this.lookup(diagnostics, cancellation.signal), this.waitForAbort(cancellation.signal)])
      event = { ...event, ok: true, match }
    } catch (error) {
      if (cancellation.signal.aborted) diagnostics.outcome = `timedOut`
      event.error = error instanceof Error ? error.message : `Player lookup failed. Please try again.`
    } finally {
      clearTimeout(timeout)
      cancellation.abort()
      this.setLoading(false)
      diagnostics.totalMs = Math.round(performance.now() - started)
      console.info(`[PlayerDetection/F4] ${JSON.stringify(diagnostics)}`)
      this.notify({ ...event, diagnostics })
      this.isRunning = false
    }
  }

  private async waitForAbort(signal: AbortSignal): Promise<never> {
    await once(signal, `abort`)
    throw signal.reason
  }

  private async lookup(diagnostics: SnapshotLookupDiagnostics, signal: AbortSignal) {
    const previousId = this.snapshots.get()?.gameServerId
    const generation = this.snapshots.invalidationVersion
    const epoch = this.httpClient.authenticatedEpoch
    if (epoch === null) throw new Error(`Sign in to SpellBook, then try again.`)
    const assertCurrent = () => {
      signal.throwIfAborted()
      if (this.httpClient.authenticatedEpoch !== epoch || this.snapshots.invalidationVersion !== generation
        || previousId !== undefined && this.snapshots.get()?.gameServerId !== previousId) {
        diagnostics.outcome = `stale`
        throw new Error(`Your connection changed. Please try again.`)
      }
    }
    this.notify({ requestId: diagnostics.requestId, phase: `started` })
    const prepared = await Promise.allSettled([this.capture(diagnostics, signal), this.prepareRoster(diagnostics, assertCurrent, signal)])
    signal.throwIfAborted()
    const image = prepared[0]
    const server = prepared[1]
    if (image.status === `rejected`) {
      diagnostics.outcome = `captureFailed`
      throw image.reason
    }
    if (server.status === `rejected`) {
      if (diagnostics.outcome !== `stale`) diagnostics.outcome = `rosterUnavailable`
      throw server.reason
    }
    assertCurrent()
    if (!this.inGame()) throw new Error(`Join a game server, then try again.`)

    const requestStarted = performance.now()
    let response: CoreCallResult
    try {
      response = await this.httpClient.postServer(`/playerDetection`, {
        imageBase64: image.value, gameServerId: server.value.gameServerId, clientId: this.roster.clientId
      }, signal)
    } finally {
      diagnostics.requestMs = Math.round(performance.now() - requestStarted)
    }
    signal.throwIfAborted()
    const result = this.data<PlayerDetectionResult>(response)
    diagnostics.inferenceMs = result.inferenceMs
    diagnostics.costUsd = result.costUsd
    diagnostics.inputTokens = result.inputTokens
    diagnostics.confidence = result.confidence
    diagnostics.margin = result.margin
    diagnostics.playerName = result.proposedPlayer?.name ?? null
    diagnostics.outcome = result.reason
    assertCurrent()
    if (!this.inGame() || this.snapshots.get()?.gameServerId !== server.value.gameServerId) {
      diagnostics.outcome = `stale`
      throw new Error(`Your connection changed. Please try again.`)
    }
    if (!result.player) throw new Error(`Could not find player`)
    return { playfabId: result.player.playfabId, gameServerId: server.value.gameServerId }
  }

  private async capture(diagnostics: SnapshotLookupDiagnostics, signal: AbortSignal): Promise<string> {
    const started = performance.now()
    try {
      const response = await this.httpClient.callCore(`/v2/snapshot/image`, {
        method: `POST`, body: JSON.stringify({ id: diagnostics.requestId }), signal
      })
      signal.throwIfAborted()
      const image = this.data<{ imageBase64?: string }>(response)
      if (!image.imageBase64) throw new Error(`Could not capture the game. Please try again.`)
      this.setLoading(true)
      return image.imageBase64
    } finally {
      diagnostics.captureMs = Math.round(performance.now() - started)
    }
  }

  private async prepareRoster(diagnostics: SnapshotLookupDiagnostics, assertCurrent: () => void, signal: AbortSignal): Promise<ServerLiveRoster> {
    const started = performance.now()
    try {
      let id = this.snapshots.get()?.gameServerId
      let server = id ? await this.readRoster(id, signal) : null
      assertCurrent()
      if (!server?.sources.listplayers.fresh) {
        const refreshed = await this.roster.refresh(signal)
        assertCurrent()
        if (!refreshed.ok) throw new Error(ResponseParser.getCallErrorMessage(refreshed, `Could not update the player list. Please try again.`))
        id = this.snapshots.get()?.gameServerId
        server = id ? await this.readRoster(id, signal) : null
      }
      assertCurrent()
      if (!server?.sources.listplayers.fresh) throw new Error(`Could not update the player list. Please try again.`)
      return server
    } finally {
      diagnostics.rosterMs = Math.round(performance.now() - started)
    }
  }

  private async readRoster(id: number, signal: AbortSignal): Promise<ServerLiveRoster | null> {
    const response = await this.httpClient.getServer(`/gameserver/${id}/players`,
      { view: `live`, clientId: this.roster.clientId }, signal)
    signal.throwIfAborted()
    if (response.status === 403 || response.status === 404) return null
    const { roster } = this.data<{ roster: ServerLiveRoster }>(response)
    if (roster?.gameServerId !== id) throw new Error(`Could not read the player list. Please try again.`)
    return roster
  }

  private data<T>(response: CoreCallResult): T {
    const envelope = response.data as { ok?: boolean, data?: T } | null
    if (!response.ok || envelope?.ok !== true || !envelope.data)
      throw new Error(ResponseParser.getCallErrorMessage(response, `Player lookup failed. Please try again.`))
    return envelope.data
  }

  private notify(event: SnapshotLookupEvent): void {
    try { this.overlayWindow.sendToCurrent(`overlay:snapshotLookup`, event) }
    catch { console.warn(`[PlayerDetection/F4] Could not deliver lookup feedback.`) }
  }

  private setLoading(loading: boolean): void {
    try { this.roster.setLoading(loading) }
    catch { console.warn(`[PlayerDetection/F4] Could not update lookup feedback.`) }
  }
}
