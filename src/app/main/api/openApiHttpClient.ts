import createClient from 'openapi-fetch'
import type { CoreCallResult } from '../types'
import { ResponseParser } from './response-parser'

type OpenApiMethod = 'delete' | 'get' | 'head' | 'options' | 'patch' | 'post' | 'put' | 'trace'

type OpenApiOperation = {
  parameters?: {
    query?: Record<string, unknown>
  }
  requestBody?: {
    content: {
      'application/json': unknown
    }
  }
  responses: {
    200: {
      content: {
        'application/json': unknown
      }
    }
    default: {
      content: {
        'application/json': unknown
      }
    }
  }
}

type OpenApiPaths = Record<string, Record<OpenApiMethod, OpenApiOperation>>

export type OpenApiRequestOptions = Omit<RequestInit, 'body' | 'method'> & {
  body?: unknown
  params?: {
    query?: Record<string, unknown>
  }
}

type OpenApiResponse = {
  data?: unknown
  error?: unknown
  response: Response
}

export class OpenApiHttpClient {
  private readonly call

  constructor(
    baseUrl: string,
    private readonly unavailableCode: string,
    private readonly unavailableMessage: string
  ) {
    this.call = createClient<OpenApiPaths>({ baseUrl })
  }

  async request(method: string, path: string, options: OpenApiRequestOptions = {}): Promise<CoreCallResult> {
    const normalizedMethod = method.toLowerCase() as OpenApiMethod

    return this.execute(() => this.call.request(normalizedMethod, path, {
      ...options,
      parseAs: 'text'
    }))
  }

  private async execute(request: () => Promise<OpenApiResponse>): Promise<CoreCallResult> {
    try {
      const { data, error, response } = await request()

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        data: OpenApiHttpClient.parseBody(data ?? error)
      }
    } catch (error) {
      return {
        ok: false,
        status: 0,
        statusText: this.unavailableCode,
        data: null,
        error: {
          code: this.unavailableCode,
          message: error instanceof Error ? error.message : this.unavailableMessage
        }
      }
    }
  }

  private static parseBody(body: unknown): unknown {
    if (typeof body !== 'string') {
      return body ?? null
    }

    return body.length > 0 ? ResponseParser.parseText(body) : null
  }
}
