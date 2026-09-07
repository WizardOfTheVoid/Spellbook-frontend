import type { HttpClient } from '../api/http-client';
import { ResponseParser } from '../api/response-parser';
import type { RequestIdFactory } from '../request-id-factory';
import type { OverlayWindowController } from '../window/overlay-window-controller';
import type { SnapshotLookupEvent, SnapshotMatchTuning } from '../types';

type SnapshotData = {
  hasText?: boolean;
  text?: string;
  lines?: string[];
  matching?: SnapshotMatchTuning;
};

/**
 * Runs the F4 game snapshot: read the bottom of the game window through Core OCR and hand the
 * text to the renderer, which owns player matching. Core never focuses the game for this call.
 */
export class SnapshotLookupService {
  private isRunning = false;

  constructor(
    private readonly httpClient: HttpClient,
    private readonly overlayWindow: OverlayWindowController,
    private readonly requestIds: RequestIdFactory
  ) {}

  async run(): Promise<void> {
    if (this.isRunning) {
      log('Detect F4', 'ignored, a lookup is already running');
      return;
    }

    this.isRunning = true;
    const startedAtMs = Date.now();
    log('Detect F4', 'requesting a game snapshot from Core');

    try {
      const event = await this.capture();
      const elapsedMs = Date.now() - startedAtMs;

      if (event.ok) {
        log('Receive snapshot', `${event.lines.length} line(s) from Core`, elapsedMs);
        log('Found text', event.lines.length > 0 ? event.lines.join(' | ') : 'none');
        log('Send to renderer', 'matching against the live player list');
      } else {
        log('Receive snapshot failed', event.error ?? 'unknown error', elapsedMs);
      }

      this.emit(event);
    } finally {
      this.isRunning = false;
    }
  }

  private async capture(): Promise<SnapshotLookupEvent> {
    const response = await this.httpClient.callCore('/v2/console/snapshot', {
      method: 'POST',
      body: JSON.stringify({ id: this.requestIds.next('snapshot') })
    });

    if (!response.ok) {
      const error = ResponseParser.getCallErrorMessage(response, 'Snapshot failed.');
      return { ok: false, hasText: false, text: '', lines: [], error };
    }

    const data = (response.data as { data?: SnapshotData } | null)?.data;
    const lines = Array.isArray(data?.lines) ? data.lines : [];

    return { ok: true, hasText: data?.hasText === true, text: data?.text ?? '', lines, matching: data?.matching };
  }

  private emit(event: SnapshotLookupEvent): void {
    const window = this.overlayWindow.getOrCreate();
    if (!window.isDestroyed()) window.webContents.send('overlay:snapshotLookup', event);
  }
}

function log(action: string, context: string, elapsedMs?: number): void {
  const timing = elapsedMs === undefined ? '' : `(${elapsedMs}ms) `;
  console.log(`[App/Snapshot] ${timing}${action}: ${context}`);
}
