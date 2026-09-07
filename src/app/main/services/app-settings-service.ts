import { app, screen, type Display, type Rectangle } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isConsoleKeyCode, type ConsoleKeyCode } from '../../shared/consoleKey'

export type AppSettings = {
  audioSfxEnabled: boolean;
  audioSfxVolume: number;
  selectedDisplayId: number | null;
  consoleKey: ConsoleKeyCode | null
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
  audioSfxEnabled: true,
  audioSfxVolume: 0.5,
  selectedDisplayId: null,
  consoleKey: null
};

export class AppSettingsService {
  private settings = { ...defaultSettings };
  constructor(private settingsPath: string | null = null) {}

  async load(): Promise<AppSettings> {
    try {
      const text = await readFile(this.getSettingsPath(), 'utf8');
      this.settings = this.normalizeSettings(JSON.parse(text));
    } catch (error) {
      if (!this.isMissingFileError(error)) {
        console.warn('Failed to read app settings; using defaults.', error);
      }

      this.settings = { ...defaultSettings };
    }

    this.settings.selectedDisplayId = this.getSelectedDisplay().id;
    return this.getSettings();
  }

  getSettings(): AppSettings {
    return { ...this.settings };
  }

  getSnapshot(): AppSettingsSnapshot {
    const display = this.getSelectedDisplay();

    return {
      settings: { ...this.settings, selectedDisplayId: display.id },
      displays: this.getDisplayOptions(),
      effectiveDisplayId: display.id
    };
  }

  async updateSettings(update: unknown): Promise<AppSettings> {
    this.settings = this.normalizeSettings({
      ...this.settings,
      ...this.normalizeUpdate(update)
    });
    this.settings.selectedDisplayId = this.getSelectedDisplay().id;

    await this.save();
    return this.getSettings();
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
    const settingsPath = this.getSettingsPath();
    await mkdir(dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, `${JSON.stringify(this.settings, null, 2)}\n`, 'utf8');
  }

  private getSettingsPath(): string {
    this.settingsPath ??= join(app.getPath('userData'), 'settings.json');
    return this.settingsPath;
  }

  private normalizeSettings(value: unknown): AppSettings {
    if (!this.isRecord(value)) {
      return { ...defaultSettings };
    }

    return {
      audioSfxEnabled: typeof value.audioSfxEnabled === 'boolean' ? value.audioSfxEnabled : defaultSettings.audioSfxEnabled,
      audioSfxVolume: this.normalizeVolume(value.audioSfxVolume) ?? defaultSettings.audioSfxVolume,
      selectedDisplayId: this.normalizeDisplayId(value.selectedDisplayId),
      consoleKey: isConsoleKeyCode(value.consoleKey) ? value.consoleKey : null
    };
  }

  private normalizeUpdate(value: unknown): AppSettingsUpdate {
    if (!this.isRecord(value)) {
      throw new Error('Settings update must be an object.');
    }

    const update: AppSettingsUpdate = {};

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
