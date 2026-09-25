import type { ActionPoll, ActionPollResult, ActionResult, ActionStart } from '@spellbook/shared/actions/actionTypes'
import type { HttpClient } from '../../api/http-client'

export class ActionRequestError extends Error {
  constructor(message: string, readonly code?: string) { super(message) }
}

export class ActionClient {
  constructor(private readonly http: Pick<HttpClient, `postServer`>) {}
  poll(input: ActionPoll) { return this.post<ActionPollResult>(`/actions/poll`, input) }
  start(runId: number, token: string) { return this.post<ActionStart>(`/actions/${runId}/start`, { token }) }
  report(runId: number, token: string, result: ActionResult) { return this.post(`/actions/${runId}/result`, { token, result }) }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await this.http.postServer(path, body)
    const envelope = response.data as { ok?: boolean, data?: T, error?: { code?: string, message?: string } } | null
    if (!response.ok || envelope?.ok === false || !envelope || !(`data` in envelope)) {
      throw new ActionRequestError(envelope?.error?.message ?? response.error?.message ?? `Action request failed.`, envelope?.error?.code ?? response.error?.code)
    }
    return envelope.data as T
  }
}
