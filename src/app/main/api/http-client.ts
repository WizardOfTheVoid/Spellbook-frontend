import type { CoreCallResult, TimedCallResult } from '../types';
import type { CoreConnection } from '../core/coreConnection'
import { CoreHttpClient } from './core-http-client';
import { CoreRequestPayloadFactory } from './core-request-payload-factory'
import { ServerHttpClient } from './server-http-client';
import type { ConsoleKeyCode } from '../../shared/consoleKey'
import { ConsoleMessageStatistics } from './consoleMessageStatistics'
import { ActionBuilder } from '../core/actionBuilder'
import { ActionClient, type ActionExecutionOptions } from '../core/actionClient'
import type { CoreCommand } from '../../shared/coreAction'
import { consoleSetupIssue } from '../../shared/consoleSetup'

type HttpClientOptions = {
  coreBaseUrl: string;
  coreAuthToken: string;
  serverBaseUrl: string;
  serverAuthToken: string;
  getConsoleKey?: () => ConsoleKeyCode | null
  getSentinelEnabled?: () => boolean
  allowAction?: (body: RequestInit[`body`]) => boolean
  getActionIssue?: () => string | null
};

/**
 * Small facade used by services that need both Core and app-server calls.
 * It keeps higher-level modules independent from the concrete Core/server client split.
 */
export class HttpClient {
  private readonly coreClient: CoreHttpClient;
  private readonly serverClient: ServerHttpClient;
  private readonly messageStatistics: ConsoleMessageStatistics

  readonly commands: ActionBuilder
  private readonly actionClient: ActionClient
  private readonly pendingActions = new Set<AbortController>()

  constructor(
    private readonly options: HttpClientOptions,
    coreRequestPayloads: CoreRequestPayloadFactory
  ) {
    this.coreClient = new CoreHttpClient(options.coreBaseUrl, options.coreAuthToken)
    this.serverClient = new ServerHttpClient(options.serverBaseUrl, options.serverAuthToken);
    this.messageStatistics = new ConsoleMessageStatistics(this.serverClient)
    this.commands = new ActionBuilder(options.getConsoleKey)
    this.actionClient = new ActionClient((path, init) => this.callCore(path, init), () => coreRequestPayloads.appTarget())
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

  async callCore(path: string, init?: RequestInit): Promise<CoreCallResult> {
    const action = new URL(path, this.coreBaseUrl).pathname.replace(/\/+$/u, ``) === `/v3/actions`
      && init?.method?.toUpperCase() === `POST`
    if (action && this.options.allowAction?.(init?.body) === false) {
      return { ok: false, status: 409, statusText: `CONSOLE_SETUP_REQUIRED`, data: null,
        error: { code: `CONSOLE_SETUP_REQUIRED`, message: this.options.getActionIssue?.() ?? consoleSetupIssue } }
    }
    const controller = action ? new AbortController() : null
    if (controller) {
      this.pendingActions.add(controller)
      init = { ...init, signal: init?.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal }
    }
    const epoch = this.serverClient.authenticatedEpoch
    try {
      const result = await this.coreClient.call(path, init)
      void this.messageStatistics.record(path, init, result, epoch)
      return result
    } finally {
      if (controller) this.pendingActions.delete(controller)
    }
  }

  cancelGameActions(): void {
    for (const controller of this.pendingActions) controller.abort()
  }

  get sentinelEnabled(): boolean {
    return this.options.getSentinelEnabled?.() === true
  }

  async executeAction(commands: CoreCommand[], options: ActionExecutionOptions): Promise<CoreCallResult> {
    return this.actionClient.execute(commands, options)
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
