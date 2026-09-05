import type { HttpClient } from '../api/http-client'
import { ResponseParser } from '../api/response-parser'
import { ListPlayersSnapshotParser } from '../parsers/list-players-parser'
import { ValueReader } from '../parsers/value-reader'
import type { RequestIdFactory } from '../request-id-factory'
import type { CoreCallResult } from '../types'
import type { CurrentGameSnapshotInput } from './currentGameSnapshotStore'
import type { OverlayActivityGuard } from './overlay-activity-guard'

export type GameInputMode = `interactive` | `background`

export type ListPlayersRefresh = Readonly<{
  result: CoreCallResult
  candidate?: CurrentGameSnapshotInput
}>

export class ListPlayersService {
  constructor(
    private readonly httpClient: HttpClient,
    private readonly requestIds: RequestIdFactory,
    private readonly overlayActivity: OverlayActivityGuard
  ) {}

  async refresh(mode: GameInputMode): Promise<ListPlayersRefresh> {
    if (mode === `interactive`) {
      const inactiveResult = this.overlayActivity.getInactiveGameCommandResult()
      if (inactiveResult) return { result: inactiveResult }
    }

    const payload = {
      id: this.requestIds.next(`listplayers`),
      timeoutMs: 5000
    }
    const result = mode === `background`
      ? await this.httpClient.callCore(`/v2/console/listplayers`, {
          method: `POST`,
          body: JSON.stringify({ ...payload, background: true, requireIdle: true })
        })
      : await this.httpClient.postCoreInput(`/v2/console/listplayers`, payload)

    if (!result.ok) return { result }

    const snapshot = ListPlayersSnapshotParser.extract(result)
    if (!snapshot) return { result }

    const ingestResult = await this.httpClient.postServer(`/listplayers`, snapshot)
    if (!ingestResult.ok) {
      console.warn(ResponseParser.getCallErrorMessage(ingestResult, `Server ListPlayers ingest failed.`))
      return { result: ingestResult }
    }

    const source = this.envelopeData(ingestResult)
    const envelope = ValueReader.isRecord(ingestResult.data) ? ingestResult.data : null
    const timestampUtc = envelope ? ValueReader.getString(envelope, `timestampUtc`) : null
    const accepted = source?.accepted === true
    const gameServerId = ValueReader.getNumber(source ?? {}, `gameServerId`)
    const externalId = source ? ValueReader.getString(source, `externalId`) : null

    if (!accepted || !Number.isInteger(gameServerId) || gameServerId === null || gameServerId < 1 || !externalId || !timestampUtc) {
      return { result }
    }

    return {
      result,
      candidate: {
        observedAt: timestampUtc,
        gameServerId,
        externalId,
        serverName: snapshot.serverName ?? null,
        serverAddress: snapshot.serverAddress ?? null,
        players: snapshot.players,
        parseWarnings: snapshot.parseWarnings
      }
    }
  }

  private envelopeData(result: CoreCallResult): Record<string, unknown> | null {
    const envelope = ValueReader.isRecord(result.data) ? result.data : null
    return ValueReader.isRecord(envelope?.data) ? envelope.data : envelope
  }
}
