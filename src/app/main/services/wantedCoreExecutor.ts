import { actionPriority } from '../core/actionPriority'
import type { CoreCommand } from '../../shared/coreAction'
import type { HttpClient } from '../api/http-client'
import type { RequestIdFactory } from '../request-id-factory'
import type { CoreCallResult } from '../types'
import type { OverlayActivityGuard } from './overlay-activity-guard'
import type { ResolvedWantedMessages } from './wantedMessageResolver'
import type { WantedWork } from './wantedWorkClient'

export type WantedExecutionMode = `interactive` | `background` | `sentinel`
export type WantedExecutionResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false, sentCommands?: number, failure: Readonly<{ code: string, message: string }> }>

export class WantedCoreExecutor {
  constructor(
    private readonly http: Pick<HttpClient, `commands` | `executeAction`>,
    private readonly requestIds: Pick<RequestIdFactory, `next`>,
    private readonly overlayActivity: Pick<
      OverlayActivityGuard,
      `beginGameCommandBatch` | `endGameCommandBatch` | `getInactiveGameCommandResult`
    >
  ) {}

  async execute(
    work: WantedWork,
    messages: ResolvedWantedMessages,
    mode: WantedExecutionMode,
    signal?: AbortSignal
  ): Promise<WantedExecutionResult> {
    const commands = this.commands(work, messages)
    const submit = async () => classify(await this.http.executeAction(commands, {
      id: this.requestIds.next(`wanted-${work.actionType}`), author: `system`,
      priority: actionPriority(`wanted`, commands, mode === `sentinel`),
      ...(signal ? { signal } : {})
    }), commands.length)
    if (mode !== `interactive`) return submit()
    if (work.actionType === `mock`) {
      const inactive = this.overlayActivity.getInactiveGameCommandResult()
      return inactive ? classify(inactive) : submit()
    }
    const inactive = this.overlayActivity.beginGameCommandBatch()
    if (inactive) return classify(inactive)
    try {
      return await submit()
    } finally {
      this.overlayActivity.endGameCommandBatch()
    }
  }

  private commands(work: WantedWork, messages: ResolvedWantedMessages): CoreCommand[] {
    if (work.actionType === `mock`) return this.http.commands.message(`server`, required(messages.mockServersay))
    if (work.actionType === `unban`) return this.http.commands.unban(work.playfabId)
    const commands = this.http.commands.ban(work.playfabId, work.duration ?? 999999, messages.automaticReason)
    if (work.announce) commands.push(...this.http.commands.message(`server`, required(messages.banAnnouncement)))
    return commands
  }
}

function classify(result: CoreCallResult, commandCount = 0): WantedExecutionResult {
  const envelope = isRecord(result.data) ? result.data : null
  const data = isRecord(envelope?.data) ? envelope.data : envelope
  if (result.ok && envelope?.ok !== false && data?.status === `completed` && data?.sent === true) return { ok: true }

  const error = isRecord(envelope?.error) ? envelope.error : null
  const code = value(error?.code, result.error?.code, result.statusText, `CORE_FAILED`).slice(0, 64)
  const message = value(error?.message, result.error?.message, result.statusText, `Core request failed.`).slice(0, 500)
  const sentCommands = typeof data?.sentCommands === `number` && Number.isInteger(data.sentCommands)
    && data.sentCommands > 0 && data.sentCommands <= commandCount
    && typeof data.status === `string` && [`completed`, `failed`, `expired`, `cancelled`, `superseded`].includes(data.status)
    ? data.sentCommands : 0
  return { ok: false, ...(sentCommands ? { sentCommands } : {}), failure: { code, message } }
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
