import { actionPriority } from '../core/actionPriority'
import type { ConsoleKeyCode } from '../../shared/consoleKey'
import type { HttpClient } from '../api/http-client'
import { ResponseParser } from '../api/response-parser'
import { ListPlayersSnapshotParser } from '../parsers/list-players-parser'
import { ValueReader } from '../parsers/value-reader'
import type { RequestIdFactory } from '../request-id-factory'
import type { CoreCallResult } from '../types'
import type { CurrentGameSnapshotInput } from './currentGameSnapshotStore'
import type { OverlayActivityGuard } from './overlay-activity-guard'

export type GameInputMode = `interactive` | `background` | `sentinel`

export type ListPlayersRefresh = Readonly<{
  result: CoreCallResult
  candidate?: CurrentGameSnapshotInput
  consoleOutput?: Readonly<{ result: CoreCallResult, key: ConsoleKeyCode }>
}>

export class ListPlayersService {
  constructor(
    private readonly httpClient: HttpClient,
    private readonly requestIds: RequestIdFactory,
    private readonly overlayActivity: OverlayActivityGuard,
    private readonly observeConsole: (result: CoreCallResult, key: ConsoleKeyCode) => void = () => undefined
  ) {}

  async refresh(mode: GameInputMode, signal?: AbortSignal): Promise<ListPlayersRefresh> {
    if (mode === `interactive`) {
      const inactiveResult = this.overlayActivity.getInactiveGameCommandResult()
      if (inactiveResult) return { result: inactiveResult }
    }

    const commands = this.httpClient.commands.raw(`ListPlayers`, { expectClipboard: true, restoreClipboard: true })
    const result = await this.httpClient.executeAction(commands, {
      id: this.requestIds.next(`listplayers`),
      author: mode === `interactive` ? `user` : `system`,
      priority: actionPriority(`listPlayers`, commands, mode === `sentinel` || this.httpClient.sentinelEnabled),
      ...(signal ? { signal } : {})
    })

    const consoleOutput = { result, key: commands[0]!.consoleKey }
    if (!signal?.aborted) this.observeConsole(result, consoleOutput.key)
    if (!result.ok) return { result, consoleOutput }

    const snapshot = ListPlayersSnapshotParser.extract(result)
    if (!snapshot) return { result, consoleOutput }

    const ingestResult = await this.httpClient.postServer(`/listplayers`, snapshot)
    if (!ingestResult.ok) {
      console.warn(ResponseParser.getCallErrorMessage(ingestResult, `Server ListPlayers ingest failed.`))
      return { result: ingestResult, consoleOutput }
    }

    const source = this.envelopeData(ingestResult)
    const envelope = ValueReader.isRecord(ingestResult.data) ? ingestResult.data : null
    const timestampUtc = envelope ? ValueReader.getString(envelope, `timestampUtc`) : null
    const accepted = source?.accepted === true
    const gameServerId = ValueReader.getNumber(source ?? {}, `gameServerId`)
    const externalId = source ? ValueReader.getString(source, `externalId`) : null

    if (!accepted || !Number.isInteger(gameServerId) || gameServerId === null || gameServerId < 1 || !externalId || !timestampUtc) {
      return { result, consoleOutput }
    }

    return {
      result,
      consoleOutput,
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
