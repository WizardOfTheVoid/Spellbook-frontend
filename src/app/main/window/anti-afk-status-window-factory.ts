import { BrowserWindow, type Display } from 'electron'
import { is } from '@electron-toolkit/utils'
import { loadRendererRoute } from './rendererRoute'

const statusWidth = 300
const statusHeight = 64
const statusMargin = 24

export class AntiAfkStatusWindowFactory {
  constructor(
    private readonly mainDirectory: string,
    private readonly getTargetDisplay: () => Display
  ) {}

  createWindow(): BrowserWindow {
    const window = new BrowserWindow({
      ...this.getTargetBounds(),
      frame: false,
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
    const bounds = this.getTargetDisplay().workArea
    return {
      width: statusWidth,
      height: statusHeight,
      x: bounds.x + statusMargin,
      y: bounds.y + statusMargin
    }
  }

  loadContent(window: BrowserWindow): void {
    loadRendererRoute(window, this.mainDirectory, `/anti-afk`, is.dev ? process.env.ELECTRON_RENDERER_URL : undefined)
  }
}
