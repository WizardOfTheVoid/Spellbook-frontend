import type { CoreCallResult } from '../types';
import { OpenApiHttpClient } from './openApiHttpClient'

type MutationMethod = 'DELETE' | 'PATCH' | 'POST' | 'PUT'

/**
 * Calls the app server REST API from Electron main.
 * Server auth is optional in local dev, so this class centralizes when that header is sent.
 */
export class ServerHttpClient {
  private readonly client: OpenApiHttpClient
  private unauthorizedHandler: ((result: CoreCallResult) => void | Promise<void>) | null = null
  private authEpoch = 0

  constructor(
    readonly baseUrl: string,
    private authToken: string,
    private readonly onUnauthorizedError: (error: unknown) => void = error => {
      console.warn(`Session invalidation failed.`, error)
    }
  ) {
    this.client = new OpenApiHttpClient(baseUrl, 'SERVER_UNAVAILABLE', 'Server request failed.')
  }

  setAuthToken(token: string): void {
    const next = token.trim()
    if (next !== this.authToken) this.advanceAuthEpoch()
    this.authToken = next;
  }

  advanceAuthEpoch(): void {
    this.authEpoch += 1
  }

  setUnauthorizedHandler(handler: (result: CoreCallResult) => void | Promise<void>): void {
    this.unauthorizedHandler = handler
  }

  async post(path: string, body: unknown): Promise<CoreCallResult> {
    return this.send('POST', path, body);
  }

  async patch(path: string, body: unknown): Promise<CoreCallResult> {
    return this.send('PATCH', path, body);
  }

  async put(path: string, body: unknown): Promise<CoreCallResult> {
    return this.send(`PUT`, path, body)
  }

  async delete(path: string): Promise<CoreCallResult> {
    return this.send('DELETE', path);
  }

  async get(path: string, query: Record<string, string | number | undefined> = {}): Promise<CoreCallResult> {
    const authToken = this.authToken
    const authEpoch = this.authEpoch
    return this.observe(path, await this.client.request('GET', path, {
      headers: this.createHeaders(false, authToken),
      params: {
        query: Object.fromEntries(Object.entries(query).filter((entry): entry is [string, string | number] => entry[1] !== undefined))
      }
    }), authToken, authEpoch)
  }

  private async send(method: MutationMethod, path: string, body?: unknown): Promise<CoreCallResult> {
    const hasBody = body !== undefined;
    const authToken = this.authToken
    const authEpoch = this.authEpoch

    return this.observe(path, await this.client.request(method, path, {
      headers: this.createHeaders(hasBody, authToken),
      body
    }), authToken, authEpoch)
  }

  private observe(path: string, result: CoreCallResult, authToken: string, authEpoch: number): CoreCallResult {
    if (
      result.status === 401
      && !path.startsWith(`/auth/`)
      && authToken === this.authToken
      && authEpoch === this.authEpoch
    ) {
      this.advanceAuthEpoch()
      void this.notifyUnauthorized(result)
    }
    return result
  }

  private async notifyUnauthorized(result: CoreCallResult): Promise<void> {
    try {
      await this.unauthorizedHandler?.(result)
    } catch (error) {
      this.onUnauthorizedError(error)
    }
  }

  private createHeaders(hasBody: boolean, authToken: string): Headers {
    const headers = new Headers();
    headers.set('Accept', 'application/json');

    if (hasBody) {
      headers.set('Content-Type', 'application/json');
    }

    // Server auth is optional for local dev; send it only when configured.
    if (authToken.length > 0) {
      headers.set('Authorization', `Bearer ${authToken}`);
    }

    return headers;
  }
}
