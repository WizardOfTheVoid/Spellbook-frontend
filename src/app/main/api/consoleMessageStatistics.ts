import { randomUUID } from 'node:crypto'
import type { CoreCallResult } from '../types'
import type { ServerHttpClient } from './server-http-client'
import type { MessageContribution } from '../core/actionClient'
import type { CoreBatchCommand } from '../types'
import { unbanSubmissionCount } from '../../shared/coreAction'

type MessageCounts = { adminsay: number, serversay: number }

export class ConsoleMessageStatistics {
  constructor(private readonly server: ServerHttpClient) {}

  async record(path: string, init: RequestInit | undefined, result: CoreCallResult, epoch: number | null, gameServerId: number | null = null, contributions?: readonly MessageContribution[]): Promise<void> {
    try {
      if (epoch === null || epoch !== this.server.authenticatedEpoch || init?.method?.toUpperCase() !== `POST`) return
      const counts = confirmedMessages(path, init.body, result)
      if (!counts) return
      const payload = typeof init?.body === `string` ? JSON.parse(init.body) : null
      const correlated = isRecord(payload) && typeof payload.id === `string` && (payload.author === `user` || payload.author === `system`)
      const sent = isRecord(result.data) && isRecord(result.data.data) ? result.data.data.sentCommands as number : 0
      const commands = contributions ? contributions.filter(command => command.index < sent) : correlated && Array.isArray(payload.commands) ? payload.commands.slice(0,sent).flatMap((command,index) => {
        const kind = isRecord(command) && typeof command.command === `string` ? /^\s*(adminsay|serversay)(?=\s|$)/iu.exec(command.command)?.[1]?.toLowerCase() : null
        return kind === `adminsay` || kind === `serversay` ? [{ index, kind }] : []
      }) : []
      const signal = AbortSignal.timeout(5_000)
      while (counts.adminsay + counts.serversay > 0) {
        if (signal.aborted || epoch !== this.server.authenticatedEpoch) return
        const adminsay = Math.min(counts.adminsay, 100)
        const serversay = Math.min(counts.serversay, 100)
        const uploaded = await this.server.post(`/statistics/messages`, { requestId: randomUUID(), adminsay, serversay,
          ...(correlated && gameServerId !== null && commands.length <= 200 ? { coreActionId: payload.id, author: payload.author, gameServerId, commands } : {}) }, signal)
        if (!uploaded.ok) return
        counts.adminsay -= adminsay
        counts.serversay -= serversay
      }
    } catch {
      // Statistics must never affect console execution or trigger another game send.
    }
  }
}

export function messageContributions(commands: readonly CoreBatchCommand[]): MessageContribution[] {
  let offset = 0
  return commands.flatMap<MessageContribution>(command => {
    const index = offset
    offset += command.commandType === `unban` ? unbanSubmissionCount : 1
    return command.commandType === `admin_message` ? [{index,kind:`adminsay` as const}]
      : command.commandType === `server_message` ? [{index,kind:`serversay` as const}] : []
  })
}

function confirmedMessages(path: string, body: RequestInit[`body`], result: CoreCallResult): MessageCounts | null {
  if (!isRecord(result.data) || !isRecord(result.data.data)) return null
  const progress = result.data.data
  if (path !== `/v3/actions` || typeof body !== `string` || !Number.isSafeInteger(progress.sentCommands)) return null
  const payload: unknown = JSON.parse(body)
  if (!isRecord(payload) || !Array.isArray(payload.commands)) return null
  const sent = progress.sentCommands as number
  if (sent < 1 || sent > payload.commands.length) return null
  const counts: MessageCounts = { adminsay: 0, serversay: 0 }
  for (const command of payload.commands.slice(0, sent)) {
    if (!isRecord(command) || command.type !== `console` || typeof command.command !== `string`) continue
    const kind = /^\s*(adminsay|serversay)(?=\s|$)/iu.exec(command.command)?.[1]?.toLowerCase()
    if (kind === `adminsay` || kind === `serversay`) counts[kind]++
  }
  return counts.adminsay + counts.serversay > 0 ? counts : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === `object` && value !== null && !Array.isArray(value)
}
