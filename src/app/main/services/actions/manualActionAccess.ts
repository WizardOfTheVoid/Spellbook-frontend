import { actionExecutionIssue, type ActionExecutionAccess } from '@spellbook/shared/actions/actionExecutionAccess'
import type { HttpClient } from '../../api/http-client'
import type { CoreCallResult } from '../../types'
import type { CurrentGameSnapshotStore } from '../currentGameSnapshotStore'
import type { GameStateService } from '../../gameState/gameStateService'

export class ManualActionAccess {
  constructor(
    private readonly http: Pick<HttpClient, `getServer` | `authenticatedEpoch`>,
    private readonly snapshots: Pick<CurrentGameSnapshotStore, `get` | `invalidationVersion`>,
    private readonly gameState: Pick<GameStateService, `isInGameServer`>
  ) {}

  async check(expectedServerId?: number, targetPlayfabId?: string): Promise<CoreCallResult | null> {
    const snapshot = this.snapshots.get()
    const epoch = this.http.authenticatedEpoch
    const revision = this.snapshots.invalidationVersion
    const playerMissing = () => targetPlayfabId !== undefined && !this.snapshots.get()?.players.some(player => player.playfabId === targetPlayfabId)
    const unchanged = () => {
      const current = this.snapshots.get()
      const age = Date.now() - Date.parse(current?.observedAt ?? ``)
      return epoch !== null && epoch === this.http.authenticatedEpoch && this.gameState.isInGameServer()
        && snapshot && current?.gameServerId === snapshot.gameServerId && current.externalId === snapshot.externalId
        && revision === this.snapshots.invalidationVersion && age >= 0 && age <= 25_000 && !playerMissing()
    }
    const changed = () => denied(playerMissing() ? `This player is not in your current server.` : `The current server or session changed. Reopen the actions.`)
    if (!snapshot || !unchanged() || expectedServerId !== undefined && expectedServerId !== snapshot.gameServerId) return changed()

    try {
      const response = await this.http.getServer(`/server-profiles/active`, { externalId: snapshot.externalId })
      if (!unchanged()) return changed()
      const envelope = response.data as { ok?: boolean, data?: ActionExecutionAccess & { gameServer?: { id: number, externalId: string } } } | null
      if (!response.ok || envelope?.ok === false) return denied(`Could not check action access. Try again.`)
      const issue = actionExecutionIssue(envelope?.data)
      if (issue) return denied(issue)
      const server = envelope?.data?.gameServer
      return server?.id === snapshot.gameServerId && server.externalId === snapshot.externalId ? null : changed()
    } catch { return denied(`Could not check action access. Try again.`) }
  }
}

function denied(message: string): CoreCallResult {
  return { ok: false, status: 403, statusText: `ACTION_EXECUTION_DENIED`, data: null,
    error: { code: `ACTION_EXECUTION_DENIED`, message } }
}
