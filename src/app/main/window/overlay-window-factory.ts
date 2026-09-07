import { BrowserWindow, type Display, type Rectangle } from 'electron';
import { join } from 'node:path';
import { is } from '@electron-toolkit/utils';
import { loadRendererRoute } from './rendererRoute'

/**
 * Creates and loads the transparent overlay BrowserWindow.
 * The paths are resolved from the compiled main directory so dev and packaged builds load the same preload shape.
 */
export class OverlayWindowFactory {
  constructor(
    private readonly mainDirectory: string,
    private readonly getTargetDisplay: () => Display,
    private readonly appIconPath: string
  ) {}

  createWindow(): BrowserWindow {
    const bounds = this.getTargetDisplayBounds();

    return new BrowserWindow({
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      minWidth: 760,
      minHeight: 480,
      frame: false,
      thickFrame: false,
      show: false,
      transparent: true,
      hasShadow: false,
      focusable: true,
      skipTaskbar: false,
      resizable: false,
      fullscreenable: false,
      icon: this.appIconPath,
      backgroundColor: '#00000000',
      webPreferences: {
        // mainDirectory is the compiled out/main folder, so preload stays one level up.
        preload: join(this.mainDirectory, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });
  }

  getTargetDisplayBounds(): Rectangle {
    return this.getTargetDisplay().bounds;
  }

  loadContent(window: BrowserWindow): void {
    loadRendererRoute(window, this.mainDirectory, `/`, is.dev ? process.env.ELECTRON_RENDERER_URL : undefined)
  }
}
