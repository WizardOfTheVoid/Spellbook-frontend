import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdir, mkdtemp, readFile, writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Display } from 'electron'
import { AppSettingsService } from './app-settings-service'

const maintenanceScratch = fileURLToPath(new URL(`../../../../../.artifacts/tmp/maintenanceMode/settings/`, import.meta.url))

test(`failed maintenance persistence is retried on the next identical snapshot`, async () => {
  await mkdir(maintenanceScratch, { recursive: true })
  const folder = await mkdtemp(join(maintenanceScratch, `retry-`))
  const blocked = join(folder, `blocked`)
  await writeFile(blocked, `temporary obstruction`)
  const settings = new TestSettingsService(join(blocked, `settings.json`))
  const snapshot = { enabled: true, title: `Upgrade`, text: `Please wait`, revision: 3 }
  await assert.rejects(settings.saveMaintenanceSnapshot(`https://example.test/api`, snapshot))
  await unlink(blocked)
  await settings.saveMaintenanceSnapshot(`https://example.test/api`, snapshot)
  const reloaded = new TestSettingsService(join(blocked, `settings.json`))
  await reloaded.load()
  assert.deepEqual(reloaded.getMaintenanceSnapshot(`https://example.test/api`), snapshot)
})

test(`maintenance cache survives settings writes and is scoped to the complete API base URL`, async () => {
  await mkdir(maintenanceScratch, { recursive: true })
  const path = join(await mkdtemp(join(maintenanceScratch, `cache-`)), `settings.json`)
  const settings = new TestSettingsService(path)
  const snapshot = { enabled: true, title: `Upgrade`, text: `One\nTwo`, revision: 8 }
  await Promise.all([
    settings.saveMaintenanceSnapshot(`https://example.test/api/`, snapshot),
    settings.updateSettings({ audioSfxEnabled: false })
  ])
  const reloaded = new TestSettingsService(path)
  await reloaded.load()
  assert.deepEqual(reloaded.getMaintenanceSnapshot(`https://example.test/api`), snapshot)
  assert.equal(reloaded.getMaintenanceSnapshot(`https://example.test/other`), null)
  assert.equal(reloaded.getSettings().audioSfxEnabled, false)
})

test('uses 50% SFX volume for a fresh settings service', () => {
  const settings = new AppSettingsService().getSettings()

  assert.equal(settings.audioSfxVolume, 0.5)
  assert.equal(settings.consoleKey, null)
})

class TestSettingsService extends AppSettingsService {
  override getSelectedDisplay(): Display {
    return { id: 7 } as Display
  }
}

test(`Debug defaults off and persists locally as a boolean`, async () => {
  const path = join(await mkdtemp(join(tmpdir(), `spellbook-debug-`)), `settings.json`)
  const settings = new TestSettingsService(path)
  assert.equal(settings.getSettings().debug, false)
  await settings.updateSettings({ debug: true })
  assert.equal((await new TestSettingsService(path).load()).debug, true)
  await assert.rejects(settings.updateSettings({ debug: `true` }), /boolean/u)
})

test(`overlay and player binds persist and reject conflicts in either direction`, async () => {
  const path = join(await mkdtemp(join(tmpdir(), `spellbook-binds-`)), `settings.json`)
  const settings = new TestSettingsService(path)
  assert.equal(settings.getSettings().overlayKey, `F3`)
  assert.equal(settings.getSettings().quickOpenPlayerKey, `F4`)
  await settings.updateSettings({ overlayKey: `F8`, quickOpenPlayerKey: `F7` })
  await settings.updateSettings({ audioSfxEnabled: false })
  assert.equal((await new TestSettingsService(path).load()).overlayKey, `F8`)
  assert.equal((await new TestSettingsService(path).load()).quickOpenPlayerKey, `F7`)
  for (const update of [{ overlayKey: `F7` }, { consoleKey: `F8` }, { quickOpenPlayerKey: `NumpadSubtract` }]) {
    await assert.rejects(settings.updateSettings(update), /already used/u)
  }
  assert.equal(settings.getSettings().overlayKey, `F8`)
  assert.equal(JSON.parse(await readFile(path, `utf8`)).consoleKey, null)
  await assert.rejects(settings.updateSettings({ overlayKey: `F12` }), /supported/u)
})

test(`unavailable shortcuts leave saved and current settings untouched`, async () => {
  const path = join(await mkdtemp(join(tmpdir(), `spellbook-binds-`)), `settings.json`)
  const settings = new TestSettingsService(path)
  await settings.updateSettings({ overlayKey: `F8` })
  settings.setKeybindHandler(next => {
    if (next.overlayKey === `F7`) throw new Error(`Shortcut unavailable`)
  })
  await assert.rejects(settings.updateSettings({ overlayKey: `F7` }), /unavailable/u)
  assert.equal(settings.getSettings().overlayKey, `F8`)
  assert.equal(JSON.parse(await readFile(path, `utf8`)).overlayKey, `F8`)
})

test(`console key persists locally, survives other updates and can reset to the Core default`, async () => {
  const folder = await mkdtemp(join(tmpdir(), `spellbook-console-key-`))
  const path = join(folder, `settings.json`)
  const settings = new TestSettingsService(path)
  await settings.updateSettings({ consoleKey: `Backquote` })
  await settings.updateSettings({ audioSfxEnabled: false })
  const reloaded = new TestSettingsService(path)
  assert.equal((await reloaded.load()).consoleKey, `Backquote`)
  assert.equal(reloaded.getSettings().audioSfxEnabled, false)
  await reloaded.updateSettings({ consoleKey: null })
  assert.equal(JSON.parse(await readFile(path, `utf8`)).consoleKey, null)
})

test(`invalid console key updates are rejected without changing saved settings`, async () => {
  const folder = await mkdtemp(join(tmpdir(), `spellbook-console-key-`))
  const path = join(folder, `settings.json`)
  const settings = new TestSettingsService(path)
  await settings.updateSettings({ consoleKey: `Minus` })
  for (const consoleKey of [`Ctrl+KeyA`, `F4`, `__proto__`, `KeyA,KeyB`, 74, {}, undefined]) {
    await assert.rejects(settings.updateSettings({ consoleKey }), /supported physical key/u)
  }
  assert.equal(settings.getSettings().consoleKey, `Minus`)
  assert.equal(JSON.parse(await readFile(path, `utf8`)).consoleKey, `Minus`)
})

test(`old settings and invalid saved keys retain other preferences and use the default console mode`, async () => {
  const folder = await mkdtemp(join(tmpdir(), `spellbook-console-key-`))
  const path = join(folder, `settings.json`)
  for (const consoleKey of [undefined, `Alt+F4`]) {
    await writeFile(path, JSON.stringify({ audioSfxVolume: 0.25, consoleKey }))
    const settings = await new TestSettingsService(path).load()
    assert.equal(settings.consoleKey, null)
    assert.equal(settings.audioSfxVolume, 0.25)
  }
})

test(`F6 is reserved for the HUD while F5 remains configurable`, async () => {
  const path = join(await mkdtemp(join(tmpdir(), `spellbook-debug-keys-`)), `settings.json`)
  const service = new TestSettingsService(path)
  await service.load()
  await service.updateSettings({ overlayKey: `F5` })
  assert.equal(service.getSettings().overlayKey, `F5`)
  for (const name of [`consoleKey`, `overlayKey`, `quickOpenPlayerKey`]) {
    await assert.rejects(service.updateSettings({ [name]: `F6` }), /reserved/u)
  }
})
