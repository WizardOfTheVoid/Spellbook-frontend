import type { HttpClient } from '../api/http-client'
import type { RequestIdFactory } from '../request-id-factory'
import type { CoreCallResult, JsonRecord } from '../types'
import type { OverlayActivityGuard } from './overlay-activity-guard'
import type { ResolvedWantedMessages } from './wantedMessageResolver'
import type { WantedWork } from './wantedWorkClient'

export type WantedExecutionMode = `interactive` | `background`
export type WantedExecutionResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false, failure: Readonly<{ code: string, message: string }> }>

export class WantedCoreExecutor {
  constructor(
    private readonly http: Pick<HttpClient, `callCore` | `postCoreInput`>,
    private readonly requestIds: Pick<RequestIdFactory, `next`>,
    private readonly overlayActivity: Pick<
      OverlayActivityGuard,
      `beginGameCommandBatch` | `endGameCommandBatch` | `getInactiveGameCommandResult`
    >
  ) {}

  async execute(
    work: WantedWork,
    messages: ResolvedWantedMessages,
    mode: WantedExecutionMode
  ): Promise<WantedExecutionResult> {
    const path = work.actionType === `mock` ? `/v2/console/message` : `/v2/console/batch`
    const payload = this.payload(work, messages)

    if (mode === `background`) return classify(await this.background(path, payload))

    if (work.actionType === `mock`) {
      const inactive = this.overlayActivity.getInactiveGameCommandResult()
      return inactive
        ? classify(inactive)
        : classify(await this.http.postCoreInput(path, payload))
    }

    const inactive = this.overlayActivity.beginGameCommandBatch()
    if (inactive) return classify(inactive)
    try {
      return classify(await this.http.postCoreInput(path, payload))
    } finally {
      this.overlayActivity.endGameCommandBatch()
    }
  }

  private payload(work: WantedWork, messages: ResolvedWantedMessages): JsonRecord {
    const id = this.requestIds.next(`wanted-${work.actionType}`)
    if (work.actionType === `mock`) {
      return { id, kind: `admin`, message: required(messages.mockAdminsay) }
    }
    if (work.actionType === `unban`) {
      return {
        id,
        commands: [{
          commandType: `unban`,
          playfabId: work.playfabId,
          hours: null,
          message: null,
          delayMs: 0
        }]
      }
    }
    const commands: JsonRecord[] = [
      {
        commandType: `ban`,
        playfabId: work.playfabId,
        hours: work.duration ?? 999999,
        message: messages.automaticReason,
        delayMs: 0
      }
    ]
    if (work.announce) {
      commands.push({
        commandType: `server_message`,
        message: required(messages.banAnnouncement),
        delayMs: 0
      })
    }
    return {
      id,
      commands
    }
  }

  private background(path: string, payload: JsonRecord): Promise<CoreCallResult> {
    const { id, ...rest } = payload
    return this.http.callCore(path, {
      method: `POST`,
      body: JSON.stringify({ id, background: true, requireIdle: true, ...rest })
    })
  }
}

function classify(result: CoreCallResult): WantedExecutionResult {
  const envelope = isRecord(result.data) ? result.data : null
  const data = isRecord(envelope?.data) ? envelope.data : envelope
  if (result.ok && envelope?.ok !== false && data?.sent === true) return { ok: true }

  const error = isRecord(envelope?.error) ? envelope.error : null
  const code = value(error?.code, result.error?.code, result.statusText, `CORE_FAILED`).slice(0, 64)
  const message = value(error?.message, result.error?.message, result.statusText, `Core request failed.`).slice(0, 500)
  return { ok: false, failure: { code, message } }
}

function value(...values: unknown[]): string {
  return values.find(candidate => typeof candidate === `string` && Boolean(candidate.trim())) as string
}

function required(value: string | undefined): string {
  if (!value?.trim()) throw new Error(`Wanted Core message is required.`)
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === `object` && value !== null && !Array.isArray(value)
}
