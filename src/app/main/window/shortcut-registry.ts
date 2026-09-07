import { globalShortcut } from 'electron'
import { defaultKeybinds, shortcutAccelerator, type KeybindSettings } from '../../shared/keybinds'
import type { OverlayWindowController } from './overlay-window-controller'

type ShortcutApi = Pick<typeof globalShortcut, `register` | `unregister` | `unregisterAll` | `setSuspended`>

export class ShortcutRegistry {
  private active = new Map<string, () => void>()
  private recording = false

  constructor(
    private readonly overlayWindow: Pick<OverlayWindowController, `toggle`>,
    private readonly runSnapshotLookup: () => void,
    private readonly shortcuts: ShortcutApi = globalShortcut
  ) {}

  register(settings: KeybindSettings = defaultKeybinds): void {
    for (const [key, callback] of this.bindings(settings)) {
      if (this.shortcuts.register(key, () => this.active.get(key)?.())) this.active.set(key, callback)
      else console.warn(`Could not register ${key}. Another application may already use this key.`)
    }
  }

  apply(settings: KeybindSettings): void {
    this.setRecording(false)
    const next = this.bindings(settings)
    const added: string[] = []
    try {
      for (const [key] of next) {
        if (this.active.has(key)) continue
        if (!this.shortcuts.register(key, () => this.active.get(key)?.())) {
          throw new Error(`Could not register ${key}. Another application may already use this key.`)
        }
        added.push(key)
      }
    } catch (error) {
      for (const key of added) this.shortcuts.unregister(key)
      throw error
    }
    for (const key of this.active.keys()) {
      if (!next.has(key)) this.shortcuts.unregister(key)
    }
    this.active = next
  }

  private bindings(settings: KeybindSettings): Map<string, () => void> {
    return new Map([
      [shortcutAccelerator(settings.overlayKey), () => this.overlayWindow.toggle()],
      [shortcutAccelerator(settings.quickOpenPlayerKey), this.runSnapshotLookup]
    ])
  }

  setRecording(recording: boolean): void {
    if (recording === this.recording) return
    this.shortcuts.setSuspended(recording)
    this.recording = recording
  }

  unregisterAll(): void {
    this.setRecording(false)
    this.shortcuts.unregisterAll()
    this.active.clear()
  }
}
