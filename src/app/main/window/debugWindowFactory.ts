import { BrowserWindow, type Display } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { loadRendererRoute } from './rendererRoute'

export class DebugWindowFactory {
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
      backgroundColor: `#00000000`,
      webPreferences: {
        preload: join(this.mainDirectory, `../preload/index.js`),
        additionalArguments: [`--spellbook-debug-observer`],
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    window.setAlwaysOnTop(true, `screen-saver`)
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    window.setIgnoreMouseEvents(true)
    return window
  }

  getTargetBounds(): Electron.Rectangle {
    return { ...this.getTargetDisplay().bounds }
  }

  loadContent(window: BrowserWindow): void {
    loadRendererRoute(window, this.mainDirectory, `/debug`, is.dev ? process.env.ELECTRON_RENDERER_URL : undefined)
  }
}
