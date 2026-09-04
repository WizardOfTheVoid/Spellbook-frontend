import type { CoreCallResult, JsonRecord, TimedCallResult } from '../types';
import type { CoreConnection } from '../core/coreConnection'
import { CoreHttpClient } from './core-http-client';
import { CoreRequestPayloadFactory } from './core-request-payload-factory'
import { ServerHttpClient } from './server-http-client';

type HttpClientOptions = {
  coreBaseUrl: string;
  coreAuthToken: string;
  serverBaseUrl: string;
  serverAuthToken: string;
};

/**
 * Small facade used by services that need both Core and app-server calls.
 * It keeps higher-level modules independent from the concrete Core/server client split.
 */
export class HttpClient {
  private readonly coreClient: CoreHttpClient;
  private readonly serverClient: ServerHttpClient;

  constructor(
    options: HttpClientOptions,
    private readonly coreRequestPayloads: CoreRequestPayloadFactory
  ) {
    this.coreClient = new CoreHttpClient(options.coreBaseUrl, options.coreAuthToken);
    this.serverClient = new ServerHttpClient(options.serverBaseUrl, options.serverAuthToken);
  }

  get coreBaseUrl(): string {
    return this.coreClient.baseUrl;
  }

  get serverBaseUrl(): string {
    return this.serverClient.baseUrl;
  }

  setServerAuthToken(token: string): void {
    this.serverClient.setAuthToken(token);
  }

  setCoreConnection(connection: CoreConnection): void {
    this.coreClient.setConnection(connection.baseUrl, connection.authToken)
  }

  advanceServerAuthEpoch(): void {
    this.serverClient.advanceAuthEpoch()
  }

  setServerUnauthorizedHandler(handler: (result: CoreCallResult) => void | Promise<void>): void {
    this.serverClient.setUnauthorizedHandler(handler)
  }

  callCore(path: string, init?: RequestInit): Promise<CoreCallResult> {
    return this.coreClient.call(path, init);
  }

  postCoreInput(path: string, payload: JsonRecord): Promise<CoreCallResult> {
    return this.coreClient.call(path, {
      method: 'POST',
      body: JSON.stringify(this.coreRequestPayloads.withRestoreTarget(payload))
    })
  }

  postServer(path: string, body: unknown): Promise<CoreCallResult> {
    return this.serverClient.post(path, body);
  }

  patchServer(path: string, body: unknown): Promise<CoreCallResult> {
    return this.serverClient.patch(path, body);
  }

  putServer(path: string, body: unknown): Promise<CoreCallResult> {
    return this.serverClient.put(path, body)
  }

  deleteServer(path: string): Promise<CoreCallResult> {
    return this.serverClient.delete(path);
  }

  getServer(path: string, query: Record<string, string | number | undefined> = {}): Promise<CoreCallResult> {
    return this.serverClient.get(path, query);
  }

  async timeCall(call: () => Promise<CoreCallResult>): Promise<TimedCallResult> {
    const startedAtMs = Date.now();
    const result = await call();

    return {
      result,
      latencyMs: Math.max(0, Date.now() - startedAtMs)
    };
  }
}
