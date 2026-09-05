import type { HttpClient } from '../api/http-client';
import type { CoreCallResult, FocusState } from '../types';
import type { FocusStateFactory } from './focus-state-factory';
import type { FocusStateLogger } from './focus-state-logger';

/**
 * Maintains the latest focus state for the overlay and game window.
 * The monitor only wakes Core when Electron says the overlay is foreground-interactive.
 */
export class FocusMonitor {
  private interval: NodeJS.Timeout | null = null;
  private inFlightRefresh: Promise<FocusState> | null = null;
  private latestState: FocusState;

  constructor(
    private readonly httpClient: HttpClient,
    private readonly stateFactory: FocusStateFactory,
    private readonly logger: FocusStateLogger,
    private readonly intervalMs: number,
    private readonly shouldPollCore: () => boolean
  ) {
    this.latestState = this.stateFactory.create(null);
  }

  start(): void {
    if (this.interval) {
      return;
    }

    void this.refresh();
    this.interval = setInterval(() => {
      void this.refresh();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.inFlightRefresh = null;
  }

  refresh(): Promise<FocusState> {
    if (this.inFlightRefresh) {
      return this.inFlightRefresh;
    }

    this.inFlightRefresh = this.refreshState()
      .finally(() => {
        this.inFlightRefresh = null;
      });

    return this.inFlightRefresh;
  }

  capture(coreHealth: CoreCallResult | null): FocusState {
    this.latestState = this.stateFactory.create(coreHealth);
    return this.latestState;
  }

  getLatestState(): FocusState {
    return this.latestState;
  }

  private async refreshState(): Promise<FocusState> {
    // Hidden or unfocused overlays can update local focus state without waking Core every interval.
    if (!this.shouldPollCore()) {
      this.latestState = this.stateFactory.createLocal(this.latestState);
      return this.latestState;
    }

    const coreHealth = await this.httpClient.callCore('/v2/health', { method: 'GET' });
    const focusState = this.capture(coreHealth);
    this.logger.log(focusState);
    return focusState;
  }
}