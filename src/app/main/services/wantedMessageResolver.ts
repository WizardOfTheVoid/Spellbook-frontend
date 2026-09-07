import { resolveTemplate, type TemplateValues } from '../../shared/messageTemplates'
import type { WantedRuntimeConfig } from './wantedRuntimeConfig'
import type { WantedMessageContext, WantedWork } from './wantedWorkClient'

export type ResolvedWantedMessages = Readonly<{
  automaticReason: string
  banAnnouncement?: string
  mockAdminsay?: string
}>

const actionLabels = {
  ban: `banned`,
  unban: `unbanned`,
  mock: `mocked`
} as const

export class WantedMessageResolver {
  constructor(private readonly config: Pick<
    WantedRuntimeConfig,
    `messagePrefix` | `mockMessage` | `actionMessage`
  >) {}

  resolve(work: WantedWork, context: WantedMessageContext, playerName?: string): ResolvedWantedMessages {
    const values = this.values(work, context, playerName)

    if (work.actionType === `ban`) {
      return {
        automaticReason: work.creationType === `manual`
          ? this.automatic(work.sourceReason ?? ``)
          : this.automatic(this.message(work.sourceReason ?? ``, values, context)),
        banAnnouncement: this.required(this.message(this.config.actionMessage, values, context))
      }
    }

    if (work.actionType === `mock`) {
      const message = this.automatic(this.message(this.config.mockMessage, values, context))
      return { automaticReason: message, mockAdminsay: message }
    }

    return {
      automaticReason: this.automatic(this.message(this.config.actionMessage, values, context))
    }
  }

  private values(work: WantedWork, context: WantedMessageContext, playerName?: string): TemplateValues {
    return {
      user: playerName ?? work.playfabId,
      duration: work.duration === null ? `MAX` : String(work.duration),
      admin: context.admin,
      playfab: work.playfabId,
      server_name: context.serverName,
      clan_name: context.clanName,
      clan_tag: context.clanTag,
      action: actionLabels[work.actionType],
      type: work.actionType === `unban` || work.offenseType === `hacker` ? `Cheating` : work.offenseType ?? ``,
      reason: work.sourceReason ?? ``
    }
  }

  private message(template: string, values: TemplateValues, context: WantedMessageContext): string {
    const prefix = resolveTemplate(this.config.messagePrefix, values, context.variables).trim()
    const body = resolveTemplate(template, values, context.variables).trim()
    return [prefix, body].filter(Boolean).join(` `)
  }

  private automatic(message: string): string {
    return this.required(message).slice(0, 180)
  }

  private required(message: string): string {
    if (!message.trim()) throw new Error(`Wanted message cannot be blank.`)
    return message
  }
}
