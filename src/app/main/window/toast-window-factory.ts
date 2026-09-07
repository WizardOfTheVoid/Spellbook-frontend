import { BrowserWindow, type Display } from 'electron';
import { join } from 'node:path';
import { is } from '@electron-toolkit/utils';
import { loadRendererRoute } from './rendererRoute'

const TOAST_WIDTH = 360;
const TOAST_HEIGHT = 132;
const TOAST_MARGIN = 24;

/**
 * Creates the toast window that shows notifications while the overlay stays hidden.
 * It stays unfocusable so a dismiss click never pulls the game out of the foreground.
 */
export class ToastWindowFactory {
  constructor(
    private readonly mainDirectory: string,
    private readonly getTargetDisplay: () => Display
  ) {}

  createWindow(): BrowserWindow {
    const window = new BrowserWindow({
      ...this.getTargetBounds(),
      frame: false,
      thickFrame: false,
      show: false,
      transparent: true,
      hasShadow: false,
      focusable: false,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      fullscreenable: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: join(this.mainDirectory, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });

    window.setAlwaysOnTop(true, 'screen-saver');

    return window;
  }

  getTargetBounds(): Electron.Rectangle {
    const bounds = this.getTargetDisplay().workArea;

    return {
      width: TOAST_WIDTH,
      height: TOAST_HEIGHT,
      x: bounds.x + bounds.width - TOAST_WIDTH - TOAST_MARGIN,
      y: bounds.y + bounds.height - TOAST_HEIGHT - TOAST_MARGIN
    };
  }

  loadContent(window: BrowserWindow): void {
    loadRendererRoute(window, this.mainDirectory, `/toast`, is.dev ? process.env.ELECTRON_RENDERER_URL : undefined)
  }
}
