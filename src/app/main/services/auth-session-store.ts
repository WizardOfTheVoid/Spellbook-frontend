import { app, safeStorage } from 'electron';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export class AuthSessionStore {
  private readonly path = join(app.getPath('userData'), 'auth-session.bin');

  async load(): Promise<string> {
    try {
      const encrypted = await readFile(this.path);
      return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(encrypted) : '';
    } catch {
      return '';
    }
  }

  async save(token: string): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure session storage is unavailable.');
    }

    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, safeStorage.encryptString(token));
  }

  async clear(): Promise<void> {
    await rm(this.path, { force: true });
  }
}