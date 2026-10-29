import { actionEventsLimits as limits, type LocalActionReport } from '@spellbook/shared/actionEvents'
import type { HttpClient } from '../../api/http-client'
import type { CoreCallResult } from '../../types'

type ReporterHttp = Pick<HttpClient, `authenticatedEpoch` | `postServer`>
type LocalAction = Pick<LocalActionReport, `coreActionId` | `gameServerId` | `target` | `action` | `profile`>

export async function executeLocalAction(http: ReporterHttp, input: LocalAction, execute: () => Promise<CoreCallResult>): Promise<CoreCallResult> {
  const epoch = http.authenticatedEpoch
  const requestedAt = new Date().toISOString()
  const record = (result?: CoreCallResult) => {
    if (epoch === null || epoch === undefined || !input.gameServerId) return
    const envelope = result?.data as { data?: { status?: string, sentCommands?: number } } | null
    const progress = envelope?.data
    const status = progress?.status
    const outcome = status === `completed` || status === `failed` ? status
      : status === `cancelled` || status === `expired` || status === `superseded` ? `cancelled` : `unknown`
    const sentCommands = Number.isSafeInteger(progress?.sentCommands) && progress!.sentCommands! >= 0 ? progress!.sentCommands! : null
    void reportLocalAction(http, epoch, { ...input, requestedAt, completedAt: new Date().toISOString(), status: outcome, sentCommands })
  }
  try {
    const result = await execute()
    record(result)
    return result
  } catch (error) {
    if (!(error instanceof RangeError)) record()
    throw error
  }
}

export async function reportLocalAction(http: ReporterHttp, epoch: number, report: LocalActionReport): Promise<void> {
  if (http.authenticatedEpoch !== epoch) return
  try {
    const bounded = { ...report, action: { ...report.action, label: report.action.label.slice(0, limits.label),
      commands: report.action.commands.slice(0, limits.commands).map(command => ({ ...command,
        ...(command.message === undefined ? {} : { message: command.message.slice(0, limits.message) }) })) } }
    const result = await http.postServer(`/actions/local-results`, bounded, AbortSignal.timeout(5000))
    if (!result.ok) console.warn(`[Action Events] Local result upload failed (${result.status}).`)
  } catch {
    console.warn(`[Action Events] Local result upload unavailable.`)
  }
}
