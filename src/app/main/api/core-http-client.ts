import type { CoreCallResult } from '../types';
import { OpenApiHttpClient } from './openApiHttpClient'
import { ResponseParser } from './response-parser';
import { consoleKeyHeader, isConsoleKeyCode, type ConsoleKeyCode } from '../../shared/consoleKey'

/**
 * Calls the local Core REST API.
 * This class owns Core-specific headers, mutating-request auth, and unavailable-error shaping.
 */
export class CoreHttpClient {
  private client: OpenApiHttpClient
  private currentBaseUrl: string
  private connectionReplaced = false
  private requestStarted = false

  constructor(
    baseUrl: string,
    private authToken: string,
    private readonly getConsoleKey: () => ConsoleKeyCode | null = () => null
  ) {
    this.currentBaseUrl = baseUrl
    this.client = new OpenApiHttpClient(baseUrl, 'CORE_UNAVAILABLE', 'Core request failed.')
  }

  get baseUrl(): string {
    return this.currentBaseUrl
  }

  setConnection(baseUrl: string, authToken: string): void {
    if (this.connectionReplaced || this.requestStarted) {
      throw new Error(`Core connection may be replaced once before the first request`)
    }
    this.currentBaseUrl = baseUrl
    this.authToken = authToken
    this.client = new OpenApiHttpClient(baseUrl, 'CORE_UNAVAILABLE', 'Core request failed.')
    this.connectionReplaced = true
  }

  async call(path: string, init?: RequestInit): Promise<CoreCallResult> {
    this.requestStarted = true
    const { body, method = 'GET', ...options } = init ?? {}
    const headers = new Headers(options.headers);
    headers.set('Accept', 'application/json');

    headers.delete(consoleKeyHeader)
    if (method.toUpperCase() === `POST` && path.startsWith(`/v2/console/`)) {
      const consoleKey = this.getConsoleKey()
      if (consoleKey !== null) {
        if (!isConsoleKeyCode(consoleKey)) throw new Error(`Unsupported console key.`)
        headers.set(consoleKeyHeader, consoleKey)
      }
    }

    // Core only requires the local token for mutating requests; health stays cheap and unauthenticated.
    if (method.toUpperCase() !== 'GET') {
      headers.set('Content-Type', 'application/json');
      headers.set('X-Chiv-Admin-Token', this.authToken);
    }

    return this.client.request(method, path, {
      ...options,
      headers,
      body: typeof body === 'string' ? ResponseParser.parseText(body) : body ?? undefined
    })
  }
}
