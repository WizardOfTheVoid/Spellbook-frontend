import { app, screen, type Display, type Rectangle } from 'electron';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path';
import { isConsoleKeyCode, type ConsoleKeyCode } from '../../shared/consoleKey'
import { consoleKeyUpdate, defaultKeybinds, isShortcutKeyCode, keybindConflict, type KeybindSettings, type ShortcutKeyCode } from '../../shared/keybinds'
import type { MaintenanceState } from '@spellbook/shared/maintenance'
import { normalizeMaintenanceBaseUrl, readMaintenanceState } from '../../shared/maintenance'

export type AppSettings = {
  debug: boolean
  audioSfxEnabled: boolean;
  audioSfxVolume: number;
  selectedDisplayId: number | null;
  consoleKey: ConsoleKeyCode | null
  overlayKey: ShortcutKeyCode
  quickOpenPlayerKey: ShortcutKeyCode
  gameServerKey: ShortcutKeyCode | null
};

export type AppSettingsUpdate = Partial<AppSettings>;

export type SettingsDisplayOption = {
  id: number;
  label: string;
  isPrimary: boolean;
  bounds: Rectangle;
};

export type AppSettingsSnapshot = {
  settings: AppSettings;
  displays: SettingsDisplayOption[];
  effectiveDisplayId: number;
};

const defaultSettings: AppSettings = {
  debug: false,
  audioSfxEnabled: true,
  audioSfxVolume: 0.5,
  selectedDisplayId: null,
  ...defaultKeybinds
};

export class AppSettingsService {
  private settings = { ...defaultSettings };
  private applyKeybinds: (settings: KeybindSettings) => void = () => undefined
  private updating = false
  private maintenance: Record<string, MaintenanceState> = {}
  private saveTail = Promise.resolve()
  private loadFailed = false
  private reloadRequest: Promise<void> | null = null
  private onChange: (settings: AppSettings) => void = () => undefined
  constructor(private settingsPath: string | null = null) {}

  setKeybindHandler(handler: (settings: KeybindSettings) => void): void {
    this.applyKeybinds = handler
  }

  setChangeHandler(handler: (settings: AppSettings) => void): void {
    this.onChange = handler
  }

  async load(): Promise<AppSettings> {
    try {
      const text = await readFile(this.getSettingsPath(), 'utf8');
      const value = JSON.parse(text)
      this.settings = this.normalizeSettings(value)
      this.maintenance = {}
      if (value?.maintenance && typeof value.maintenance === `object`) {
        for (const [key, raw] of Object.entries(value.maintenance)) {
          const state = readMaintenanceState(raw)
          if (state) this.maintenance[key] = state
        }
      }
      this.loadFailed = false
    } catch (error) {
      this.loadFailed = !this.isMissingFileError(error)
      if (this.loadFailed) {
        console.warn(`Could not read app settings.`, this.getSettingsPath(), error)
      } else {
        this.settings = { ...defaultSettings }
        this.maintenance = {}
      }
    }

    this.settings.selectedDisplayId = this.getSelectedDisplay().id;
    return this.getSettings();
  }

  getSettings(): AppSettings {
    return { ...this.settings };
  }

  getMaintenanceSnapshot(baseUrl: string): MaintenanceState | null {
    return structuredClone(this.maintenance[normalizeMaintenanceBaseUrl(baseUrl)] ?? null)
  }

  async saveMaintenanceSnapshot(baseUrl: string, state: MaintenanceState): Promise<void> {
    await this.ensureReadableSettings()
    const key = normalizeMaintenanceBaseUrl(baseUrl)
    if (JSON.stringify(this.maintenance[key]) === JSON.stringify(state)) return
    const previous = this.maintenance[key]
    const next = structuredClone(state)
    this.maintenance[key] = next
    try { await this.save() }
    catch (error) {
      if (this.maintenance[key] === next) {
        if (previous) this.maintenance[key] = previous
        else delete this.maintenance[key]
      }
      throw error
    }
  }

  getSnapshot(): AppSettingsSnapshot {
    const display = this.getSelectedDisplay();

    return {
      settings: { ...this.settings, selectedDisplayId: display.id },
      displays: this.getDisplayOptions(),
      effectiveDisplayId: display.id
    };
  }

  async saveConsoleKey(consoleKey: ConsoleKeyCode): Promise<void> {
    await this.ensureReadableSettings()
    await this.updateSettings(consoleKeyUpdate(this.getSettings(), consoleKey))
  }

  async updateSettings(update: unknown): Promise<AppSettings> {
    await this.ensureReadableSettings()
    if (this.updating) throw new Error(`Settings are being saved. Try again.`)
    const previous = this.getSettings()
    const next = { ...previous, ...this.normalizeUpdate(update) }
    const conflict = keybindConflict(next)
    if (conflict) throw new Error(conflict)
    const shortcutsChanged = next.overlayKey !== previous.overlayKey || next.quickOpenPlayerKey !== previous.quickOpenPlayerKey || next.gameServerKey !== previous.gameServerKey
    this.updating = true
    try {
      if (shortcutsChanged) this.applyKeybinds(next)
      this.settings = next
      this.settings.selectedDisplayId = this.getSelectedDisplay().id
      await this.save()
      this.notifySettingsChanged()
      return this.getSettings()
    } catch (error) {
      this.settings = previous
      if (shortcutsChanged) this.applyKeybinds(previous)
      throw error
    } finally {
      this.updating = false
    }
  }

  getSelectedDisplay(): Display {
    const displays = screen.getAllDisplays();
    const selectedDisplay = displays.find((display) => display.id === this.settings.selectedDisplayId);

    return selectedDisplay ?? screen.getPrimaryDisplay();
  }

  private getDisplayOptions(): SettingsDisplayOption[] {
    const primaryDisplayId = screen.getPrimaryDisplay().id;

    return screen.getAllDisplays().map((display, index) => ({
      id: display.id,
      label: this.getDisplayLabel(display, index),
      isPrimary: display.id === primaryDisplayId,
      bounds: display.bounds
    }));
  }

  private getDisplayLabel(display: Display, index: number): string {
    const bounds = display.bounds;
    const label = display.label.trim();
    const prefix = display.id === screen.getPrimaryDisplay().id ? 'Primary display' : `Display ${index + 1}`;
    const suffix = `${bounds.width}x${bounds.height} @ ${bounds.x},${bounds.y}`;

    return label.length > 0 ? `${prefix} - ${label} - ${suffix}` : `${prefix} - ${suffix}`;
  }

  private async save(): Promise<void> {
    const previous = this.saveTail
    const save = async () => {
      await previous.catch(() => undefined)
      const settingsPath = this.getSettingsPath()
      try {
        await mkdir(dirname(settingsPath), { recursive: true })
        const temporaryPath = `${settingsPath}.tmp`
        await writeFile(temporaryPath, `${JSON.stringify({ ...this.settings, maintenance: this.maintenance }, null, 2)}\n`, { encoding: `utf8`, flush: true })
        await rename(temporaryPath, settingsPath)
      } catch (error) {
        console.warn(`Could not save app settings.`, settingsPath, error)
        throw new Error(`SpellBook could not save your settings. Check Windows security and folder permissions, then try again.`, { cause: error })
      }
    }
    this.saveTail = save()
    await this.saveTail
  }

  private async ensureReadableSettings(): Promise<void> {
    if (!this.loadFailed) return
    const reload = async () => {
      await this.load()
      if (this.loadFailed) throw new Error(`SpellBook could not read your saved settings. Check Windows security and folder permissions, then try again.`)
      try { this.applyKeybinds(this.getSettings()) }
      catch (error) { console.warn(`Could not restore saved shortcuts.`, error) }
      this.notifySettingsChanged()
    }
    const request = this.reloadRequest ??= reload()
    try { await request }
    finally { if (this.reloadRequest === request) this.reloadRequest = null }
  }

  private notifySettingsChanged(): void {
    try { this.onChange(this.getSettings()) }
    catch (error) { console.warn(`Could not apply saved settings.`, error) }
  }

  private getSettingsPath(): string {
    this.settingsPath ??= join(app.getPath('userData'), 'settings.json');
    return this.settingsPath;
  }

  private normalizeSettings(value: unknown): AppSettings {
    if (!this.isRecord(value)) {
      return { ...defaultSettings };
    }

    const settings: AppSettings = {
      debug: typeof value.debug === `boolean` ? value.debug : false,
      audioSfxEnabled: typeof value.audioSfxEnabled === 'boolean' ? value.audioSfxEnabled : defaultSettings.audioSfxEnabled,
      audioSfxVolume: this.normalizeVolume(value.audioSfxVolume) ?? defaultSettings.audioSfxVolume,
      selectedDisplayId: this.normalizeDisplayId(value.selectedDisplayId),
      consoleKey: isConsoleKeyCode(value.consoleKey) ? value.consoleKey : null,
      overlayKey: isShortcutKeyCode(value.overlayKey) ? value.overlayKey : defaultKeybinds.overlayKey,
      quickOpenPlayerKey: isShortcutKeyCode(value.quickOpenPlayerKey) ? value.quickOpenPlayerKey : defaultKeybinds.quickOpenPlayerKey,
      gameServerKey: value.gameServerKey === null ? null : isShortcutKeyCode(value.gameServerKey) ? value.gameServerKey : defaultKeybinds.gameServerKey
    };
    if (keybindConflict({ ...settings, gameServerKey: null })) Object.assign(settings, { overlayKey: defaultKeybinds.overlayKey, quickOpenPlayerKey: defaultKeybinds.quickOpenPlayerKey })
    if (keybindConflict(settings)) settings.gameServerKey = null
    return settings
  }

  private normalizeUpdate(value: unknown): AppSettingsUpdate {
    if (!this.isRecord(value)) {
      throw new Error('Settings update must be an object.');
    }

    const update: AppSettingsUpdate = {};

    if (`debug` in value) {
      if (typeof value.debug !== `boolean`) throw new Error(`debug must be a boolean.`)
      update.debug = value.debug
    }

    for (const name of [`overlayKey`, `quickOpenPlayerKey`, `gameServerKey`] as const) {
      if (!(name in value)) continue
      const code = value[name]
      if (name === `gameServerKey` && code === null) {
        update.gameServerKey = null
        continue
      }
      if (!isShortcutKeyCode(code)) throw new Error(`${name} must be a supported key code.`)
      update[name] = code
    }

    if (`consoleKey` in value) {
      if (value.consoleKey !== null && !isConsoleKeyCode(value.consoleKey)) {
        throw new Error(`consoleKey must be a supported physical key code or null.`)
      }
      update.consoleKey = value.consoleKey
    }

    if ('audioSfxEnabled' in value) {
      if (typeof value.audioSfxEnabled !== 'boolean') throw new Error('audioSfxEnabled must be a boolean.');
      update.audioSfxEnabled = value.audioSfxEnabled;
    }

    if ('audioSfxVolume' in value) {
      const volume = this.normalizeVolume(value.audioSfxVolume);
      if (volume === null) throw new Error('audioSfxVolume must be a number between 0 and 1.');
      update.audioSfxVolume = volume;
    }

    if ('selectedDisplayId' in value) {
      update.selectedDisplayId = this.normalizeDisplayId(value.selectedDisplayId);
    }

    return update;
  }

  private normalizeVolume(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }

    return Math.min(1, Math.max(0, value));
  }

  private normalizeDisplayId(value: unknown): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw new Error('selectedDisplayId must be an integer or null.');
    }

    return value;
  }

  private isMissingFileError(error: unknown): boolean {
    return this.isRecord(error) && error.code === 'ENOENT';
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
