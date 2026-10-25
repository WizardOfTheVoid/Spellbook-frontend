import { ResponseParser } from '../api/response-parser';
import type { CoreCallResult, FocusState } from '../types';
import type { OverlayWindowController } from '../window/overlay-window-controller';
import { ValueReader } from '../parsers/value-reader';

/**
 * Builds FocusState objects from Core health envelopes and local Electron window state.
 * Local-only updates keep overlay focus fresh without forcing a Core health request.
 */
export class FocusStateFactory {
  constructor(private readonly overlayWindow: OverlayWindowController) {}

  create(coreHealth: CoreCallResult | null): FocusState {
    const coreEnvelope = ValueReader.isRecord(coreHealth?.data) ? coreHealth.data : null;
    const coreData = ValueReader.isRecord(coreEnvelope?.data) ? coreEnvelope.data : null;
    const coreFocus = ValueReader.isRecord(coreData?.focus) ? coreData.focus : null;
    const coreEnvelopeOk = ValueReader.getBoolean(coreEnvelope, 'ok') !== false;
    const coreReachable = coreHealth?.ok === true && coreEnvelopeOk;
    const gameIsFocused = ValueReader.getBoolean(coreFocus, 'gameIsFocused') === true;

    return {
      gameIsFocused,
      overlayIsFocused: this.overlayWindow.isFocused(),
      checkedAt: new Date().toISOString(),
      coreReachable,
      coreStatus: coreHealth?.status ?? 0,
      error: coreHealth && !coreReachable
        ? ResponseParser.getCallErrorMessage(coreHealth, 'Core health failed.')
        : undefined
    };
  }

  createLocal(previous: FocusState): FocusState {
    return {
      ...previous,
      overlayIsFocused: this.overlayWindow.isFocused(),
      checkedAt: new Date().toISOString()
    };
  }
}