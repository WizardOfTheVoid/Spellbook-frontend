import type { CoreActionOptions, CoreAppTarget, CoreCommand } from '../../shared/coreAction'
import type { CoreCallResult } from '../types'
import { buildAction } from './actionBuilder'

export type MessageContribution = { index: number, kind: `adminsay` | `serversay` }
export type ActionExecutionOptions = CoreActionOptions & { signal?: AbortSignal, messageContributions?: readonly MessageContribution[] }

export class ActionClient {
  constructor(
    private readonly call: (path: string, init: RequestInit, contributions?: readonly MessageContribution[]) => Promise<CoreCallResult>,
    private readonly appTarget: () => CoreAppTarget
  ) {}

  async cancel(id: string): Promise<CoreCallResult> {
    return this.call(`/v3/actions/${encodeURIComponent(id)}/cancel`, { method: `POST` })
  }

  async execute(commands: CoreCommand[], options: ActionExecutionOptions): Promise<CoreCallResult> {
    const result = await this.call(`/v3/actions`, {
      method: `POST`, body: JSON.stringify(buildAction(commands, this.appTarget(), options)), signal: options.signal
    },options.messageContributions)
    return options.signal?.aborted && result.status === 0
      ? { ok: false, status: 499, statusText: `ACTION_CANCELLED`, data: null, error: { code: `ACTION_CANCELLED`, message: `Action request cancelled.` } }
      : result
  }
}

export async function withActionValidation(call: () => Promise<CoreCallResult>): Promise<CoreCallResult> {
  try {
    return await call()
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    return { ok: false, status: 400, statusText: `INVALID_REQUEST`, data: null, error: { code: `INVALID_REQUEST`, message: error.message } }
  }
}
