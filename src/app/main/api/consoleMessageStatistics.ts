import { randomUUID } from 'node:crypto'
import type { CoreCallResult } from '../types'
import type { ServerHttpClient } from './server-http-client'

type MessageCounts = { adminsay: number, serversay: number }

export class ConsoleMessageStatistics {
  constructor(private readonly server: ServerHttpClient) {}

  async record(path: string, init: RequestInit | undefined, result: CoreCallResult, epoch: number | null): Promise<void> {
    try {
      if (epoch === null || epoch !== this.server.authenticatedEpoch || init?.method?.toUpperCase() !== `POST`) return
      const counts = confirmedMessages(path, init.body, result)
      if (!counts) return
      const signal = AbortSignal.timeout(5_000)
      while (counts.adminsay + counts.serversay > 0) {
        if (signal.aborted || epoch !== this.server.authenticatedEpoch) return
        const adminsay = Math.min(counts.adminsay, 100)
        const serversay = Math.min(counts.serversay, 100)
        const uploaded = await this.server.post(`/statistics/messages`, { requestId: randomUUID(), adminsay, serversay }, signal)
        if (!uploaded.ok) return
        counts.adminsay -= adminsay
        counts.serversay -= serversay
      }
    } catch {
      // Statistics must never affect console execution or trigger another game send.
    }
  }
}

function confirmedMessages(path: string, body: RequestInit[`body`], result: CoreCallResult): MessageCounts | null {
  if (!isRecord(result.data) || !isRecord(result.data.data)) return null
  const envelope = result.data
  const progress = result.data.data
  if (path === `/v2/console/batch`) {
    if (typeof body !== `string` || !Number.isSafeInteger(progress.sentCommands)) return null
    const payload: unknown = JSON.parse(body)
    if (!isRecord(payload) || !Array.isArray(payload.commands)) return null
    let remaining = progress.sentCommands as number
    if (remaining <= 0) return null
    let serversay = 0
    for (const command of payload.commands) {
      if (!isRecord(command)) return null
      if (remaining > 0 && (command.commandType === `server_message` || command.commandType === `warn`)) serversay++
      // Core expands each unban into four submissions before reporting batch progress.
      remaining -= command.commandType === `unban` ? 4 : 1
    }
    return remaining > 0 ? null : { adminsay: 0, serversay }
  }
  if (![`/v2/console/message`, `/v2/console/command`, `/v2/console/warn`].includes(path)) return null
  if (!result.ok || envelope.ok !== true || progress.sent !== true || typeof envelope.command !== `string`) return null
  const command = /^\s*(adminsay|serversay)(?=\s|$)/iu.exec(envelope.command)?.[1]?.toLowerCase()
  if (!command) return null
  return { adminsay: command === `adminsay` ? 1 : 0, serversay: command === `serversay` ? 1 : 0 }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === `object` && value !== null && !Array.isArray(value)
}
