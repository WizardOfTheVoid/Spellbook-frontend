import type { CoreCallResult } from '../types';
import { OpenApiHttpClient } from './openApiHttpClient'
import { ResponseParser } from './response-parser';

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
    private authToken: string
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

    // Action status and configuration reads share input authentication; health stays unauthenticated.
    if (method.toUpperCase() !== 'GET' || path.startsWith(`/v3/`) || path.startsWith(`/chivalry2/`)) {
      headers.set('Content-Type', 'application/json');
      headers.set('X-Chiv-Admin-Token', this.authToken);
    }

    const payload = typeof body === `string` ? ResponseParser.parseText(body) : body ?? undefined
    return this.client.request(method, path, {
      ...options,
      headers,
      body: payload
    })
  }
}
