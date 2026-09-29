import type { FocusState } from '../types';

/**
 * Emits compact focus-state diagnostics.
 * Repeated steady states are collapsed so the terminal only changes when app/game/Core state changes.
 */
export class FocusStateLogger {
  private lastLogKey = '';

  log(focusState: FocusState): void {
    // This key suppresses repeated logs while app/game/Core status remains unchanged.
    const key = [
      focusState.overlayIsFocused ? 'app-focused' : 'app-background',
      focusState.gameIsFocused ? 'game-focused' : 'game-background',
      focusState.coreReachable ? 'core-ok' : 'core-error',
      focusState.coreStatus,
      focusState.error ?? ''
    ].join('|');

    if (key === this.lastLogKey) {
      return;
    }

    this.lastLogKey = key;
    const appStatus = focusState.overlayIsFocused ? 'FOCUSED' : 'BACKGROUND';
    const gameStatus = focusState.coreReachable ? (focusState.gameIsFocused ? 'FOCUSED' : 'BACKGROUND') : 'UNKNOWN';
    const coreStatus = focusState.coreReachable ? `OK ${focusState.coreStatus}` : `ERR ${focusState.coreStatus}`;
    const appText = FocusStateLogger.colorStatus(`app=${appStatus}`, focusState.overlayIsFocused);
    const gameText = FocusStateLogger.colorStatus(`game=${gameStatus}`, focusState.coreReachable && focusState.gameIsFocused);
    const coreText = FocusStateLogger.colorStatus(`core=${coreStatus}`, focusState.coreReachable);
    const suffix = focusState.error ? ` ${focusState.error}` : '';

    console.log(`[focus] ${appText} ${gameText} ${coreText} checked=${focusState.checkedAt}${suffix}`);
  }

  private static colorStatus(text: string, ok: boolean): string {
    const color = ok ? '\x1b[32m' : '\x1b[31m';
    return `${color}${text}\x1b[0m`;
  }
}