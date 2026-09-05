import type { HttpClient } from '../api/http-client';
import type { FocusMonitor } from '../focus/focus-monitor';
import type { RequestIdFactory } from '../request-id-factory';
import type { CoreCallResult } from '../types';
import type { OverlayWindowController } from '../window/overlay-window-controller';
import { ValueReader } from '../parsers/value-reader';

/**
 * Builds the explicit Health panel response.
 * Unlike periodic focus polling, this intentionally queries Core, server, database, game, and overlay status.
 */
export class AppHealthService {
  constructor(
    private readonly httpClient: HttpClient,
    private readonly focusMonitor: FocusMonitor,
    private readonly overlayWindow: OverlayWindowController,
    private readonly requestIds: RequestIdFactory
  ) {}

  async getHealth(): Promise<CoreCallResult> {
    const startedAtMs = Date.now();
    // This is an explicit health request; periodic focus polling is guarded in FocusMonitor.
    const [coreCall, serverCall] = await Promise.all([
      this.httpClient.timeCall(() => this.httpClient.callCore('/v2/health', { method: 'GET' })),
      this.httpClient.timeCall(() => this.httpClient.getServer('/health'))
    ]);
    const coreHealth = coreCall.result;
    const serverHealth = serverCall.result;
    const focus = this.focusMonitor.capture(coreHealth);

    const serverData = ValueReader.getEnvelopeData(serverHealth);
    const serverStatus = ValueReader.isRecord(serverData?.server) ? serverData.server : null;
    const databaseStatus = ValueReader.isRecord(serverData?.database) ? serverData.database : null;
    const playFabStatus = ValueReader.isRecord(serverData?.playfab) ? serverData.playfab : null
    const tornBannerStatus = ValueReader.isRecord(serverData?.tornBanner) ? serverData.tornBanner : null
    const coreEnvelope = ValueReader.isRecord(coreHealth.data) ? coreHealth.data : null;
    const coreData = ValueReader.isRecord(coreEnvelope?.data) ? coreEnvelope.data : null;
    const coreRunning = coreHealth.ok && ValueReader.getBoolean(coreEnvelope, 'ok') !== false;
    const serverRunning = serverHealth.ok && ValueReader.getBoolean(serverStatus, 'running') !== false;
    const databaseRunning = ValueReader.getBoolean(databaseStatus, 'running') === true;
    const gameRunning = ValueReader.getBoolean(coreData, 'gameRunning') === true;
    const processStatus = ValueReader.isRecord(coreData?.processStatus) ? coreData.processStatus : null;
    const window = this.overlayWindow.getCurrent();
    const overlayLatencyMs = Math.max(0, Date.now() - startedAtMs);

    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      data: {
        ok: true,
        requestId: this.requestIds.next('health'),
        timestampUtc: new Date().toISOString(),
        data: {
          overlay: {
            running: Boolean(window && !window.isDestroyed()),
            visible: window?.isVisible() === true,
            focused: focus.overlayIsFocused,
            latencyMs: overlayLatencyMs
          },
          core: {
            running: coreRunning,
            status: coreHealth.status,
            statusText: coreHealth.statusText,
            baseUrl: this.httpClient.coreBaseUrl,
            latencyMs: coreCall.latencyMs,
            health: coreData?.core
          },
          server: {
            running: serverRunning,
            status: serverHealth.status,
            statusText: serverHealth.statusText,
            baseUrl: this.httpClient.serverBaseUrl,
            latencyMs: serverCall.latencyMs,
            health: serverStatus
          },
          database: {
            running: databaseRunning,
            latencyMs: (databaseStatus ? ValueReader.getNumber(databaseStatus, 'latencyMs') : null) ?? serverCall.latencyMs,
            health: databaseStatus
          },
          playfab: {
            running: ValueReader.getBoolean(playFabStatus, 'running') === true,
            latencyMs: serverCall.latencyMs,
            health: playFabStatus
          },
          tornBanner: {
            running: ValueReader.getBoolean(tornBannerStatus, 'running') === true,
            latencyMs: serverCall.latencyMs,
            health: tornBannerStatus
          },
          game: {
            running: gameRunning,
            latencyMs: coreCall.latencyMs,
            process: coreData?.process,
            binary: coreData?.binary,
            processStatus
          },
          focus,
          coreHealth: coreHealth.data,
          serverHealth: serverHealth.data
        }
      }
    };
  }
}
