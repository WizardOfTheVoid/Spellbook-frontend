import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Display } from 'electron'
import { AppSettingsService } from '../services/app-settings-service'
import { ConsoleBindingStore } from './consoleBindingStore'
import { ConsoleSetupService } from './consoleSetupService'

class FixtureSettings extends AppSettingsService {
  override getSelectedDisplay(): Display { return { id: 7 } as Display }
}

test(`v1 upgrade requires setup while preserving the saved key shortcuts and unrelated local data`, async () => {
  const scratch = fileURLToPath(new URL(`../../../../../.artifacts/tmp/consoleKeyboardLayouts/upgrade/`, import.meta.url))
  await mkdir(scratch, { recursive: true })
  const folder = await mkdtemp(join(scratch, `admin-`))
  const settingsPath = join(folder, `settings.json`)
  const verificationPath = join(folder, `console-verification.json`)
  const legacy = JSON.stringify({ version: 1, verifiedKeys: [`Minus`] })
  await writeFile(settingsPath, JSON.stringify({ consoleKey: `Minus`, overlayKey: `F8`, quickOpenPlayerKey: `F9`, selectedDisplayId: 7, audioSfxEnabled: false, audioSfxVolume: 0.3, debug: false }))
  await writeFile(verificationPath, legacy)
  const profiles = `{"fixture":"existing profiles"}`
  const session = `fixture opaque encrypted session bytes`
  await writeFile(join(folder, `profiles.json`), profiles)
  await writeFile(join(folder, `session.dat`), session)
  const settings = new FixtureSettings(settingsPath)
  await settings.load()
  const ok = (data: unknown, requestId?: string) => ({ ok: true, status: 200, statusText: `OK`, data: { ok: true, data, requestId } })
  const bindings = new ConsoleBindingStore(verificationPath)
  const setup = new ConsoleSetupService({ callCore: async path => path === `/v3/keyboard-layouts`
    ? ok({ capabilityVersion: 1, installed: [{ id: `00000414`, displayName: `Norwegian` }], restorationFault: null })
    : path === `/v2/meta/get` ? ok({ gameRunning: true }) : ok({ sections: { [`/Script/TBL.TBLGameUserSettings`]: { bConsoleEnabled: [`True`] } } })
  }, () => settings.getSettings().consoleKey, { run: async id => ok({ status: `completed`, sent: true, players: [], rawText: `ServerName: Test`,
    keyboardLayout: { id: `00000414`, displayName: `Norwegian` } }, id) }, bindings,
  async key => { await settings.updateSettings({ consoleKey: key }) })
  await setup.loadVerification()
  assert.equal(setup.getState().setupRequired, true)
  assert.equal(settings.getSettings().consoleKey, `Minus`)
  assert.equal(await readFile(verificationPath, `utf8`), legacy)
  assert.equal(await setup.recordConsoleKey(`Minus`), true)
  assert.equal(await setup.checkConsoleBind(), true)
  const reloaded = new FixtureSettings(settingsPath)
  await reloaded.load()
  assert.deepEqual(reloaded.getSettings(), settings.getSettings())
  assert.equal(reloaded.getSettings().overlayKey, `F8`)
  assert.equal(reloaded.getSettings().quickOpenPlayerKey, `F9`)
  assert.equal(reloaded.getSettings().audioSfxVolume, 0.3)
  assert.equal(await readFile(join(folder, `profiles.json`), `utf8`), profiles)
  assert.equal(await readFile(join(folder, `session.dat`), `utf8`), session)
  const restarted = new ConsoleBindingStore(verificationPath)
  await restarted.load()
  assert.equal(restarted.get(`Minus`)?.layoutId, `00000414`)
})
