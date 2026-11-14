import assert from 'node:assert/strict'
import test from 'node:test'
import fileSystem, { mkdir, mkdtemp, readFile, writeFile, unlink, rename, rmdir } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Display } from 'electron'
import { AppSettingsService } from './app-settings-service'

const maintenanceScratch = fileURLToPath(new URL(`../../../../../.artifacts/tmp/maintenanceMode/settings/`, import.meta.url))

test(`failed maintenance persistence is retried on the next identical snapshot`, async context => {
  context.mock.method(console, `warn`, () => undefined)
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

async function persistenceFixture() {
  const scratch = fileURLToPath(new URL(`../../../../../.artifacts/tmp/consoleBindingPersistence/settings/`, import.meta.url))
  await mkdir(scratch, { recursive: true })
  return join(await mkdtemp(join(scratch, `settings-`)), `settings.json`)
}

test(`the Game Server shortcut defaults to F2 and saved changes are applied and survive restart`, async () => {
  const path = await persistenceFixture()
  const settings = new TestSettingsService(path)
  assert.equal((await settings.load()).gameServerKey, `F2`)
  let activeKey: string | null = null
  settings.setKeybindHandler(settings => { activeKey = settings.gameServerKey })

  await settings.updateSettings({ gameServerKey: `F10` })
  assert.equal(activeKey, `F10`)
  assert.equal((await new TestSettingsService(path).load()).gameServerKey, `F10`)
  await settings.updateSettings({ gameServerKey: null })
  assert.equal(activeKey, null)
  assert.equal((await new TestSettingsService(path).load()).gameServerKey, null)
})

test(`initial console setup can save F2 without taking over an existing custom shortcut`, async () => {
  const path = await persistenceFixture()
  const settings = new TestSettingsService(path)
  await settings.saveConsoleKey(`F2`)
  const saved = await new TestSettingsService(path).load()
  assert.equal(saved.consoleKey, `F2`)
  assert.equal(saved.gameServerKey, null)

  await settings.updateSettings({ gameServerKey: `F10` })
  await settings.saveConsoleKey(`Minus`)
  assert.equal((await new TestSettingsService(path).load()).gameServerKey, `F10`)
})

test(`Game Server key conflicts and reserved keys cannot change saved shortcuts`, async () => {
  const path = await persistenceFixture()
  const settings = new TestSettingsService(path)
  await settings.updateSettings({ gameServerKey: `F10` })
  for (const gameServerKey of [`F3`, `F4`, `F6`, `F12`, `NumpadSubtract`, `Ctrl+KeyA`]) {
    await assert.rejects(settings.updateSettings({ gameServerKey }))
  }
  for (const name of [`consoleKey`, `overlayKey`, `quickOpenPlayerKey`]) {
    await assert.rejects(settings.updateSettings({ [name]: `F10` }))
  }
  assert.equal((await new TestSettingsService(path).load()).gameServerKey, `F10`)
})

test(`upgrading preserves an existing F2 binding and leaves Game Server unset until a free key is chosen`, async () => {
  for (const name of [`consoleKey`, `overlayKey`, `quickOpenPlayerKey`]) {
    const path = await persistenceFixture()
    await writeFile(path, JSON.stringify({ [name]: `F2`, audioSfxVolume: 0.25 }))
    const settings = new TestSettingsService(path)
    const loaded = await settings.load()
    assert.equal(loaded[name as keyof typeof loaded], `F2`)
    assert.equal(loaded.gameServerKey, null)
    await settings.updateSettings({ audioSfxEnabled: false })
    const reloaded = await new TestSettingsService(path).load()
    assert.equal(reloaded[name as keyof typeof reloaded], `F2`)
    assert.equal(reloaded.audioSfxVolume, 0.25)
    await settings.updateSettings({ gameServerKey: `F10` })
    assert.equal((await new TestSettingsService(path).load()).gameServerKey, `F10`)
  }
})

test(`an interrupted settings write preserves the saved console key after restart`, async context => {
  context.mock.method(console, `warn`, () => undefined)
  const path = await persistenceFixture()
  const settings = new TestSettingsService(path)
  await settings.updateSettings({ consoleKey: `Minus`, overlayKey: `F8` })
  const saved = await readFile(path, `utf8`)
  const write = fileSystem.writeFile.bind(fileSystem)
  context.mock.method(fileSystem, `writeFile`, async (file: Parameters<typeof fileSystem.writeFile>[0]) => {
    await write(file, ``)
    throw Object.assign(new Error(`Fixture disk full`), { code: `ENOSPC` })
  })
  syncBuiltinESMExports()
  context.after(() => { context.mock.restoreAll(); syncBuiltinESMExports() })

  await assert.rejects(settings.updateSettings({ audioSfxEnabled: false }))

  assert.equal(await readFile(path, `utf8`), saved)
  assert.equal((await new TestSettingsService(path).load()).consoleKey, `Minus`)
  assert.equal(settings.getSettings().audioSfxEnabled, true)
})

test(`a temporary settings read failure cannot replace the saved console key with defaults`, async context => {
  context.mock.method(console, `warn`, () => undefined)
  const path = await persistenceFixture()
  const settings = new TestSettingsService(path)
  await settings.updateSettings({ consoleKey: `Minus`, overlayKey: `F8` })
  await rename(path, `${path}.saved`)
  await mkdir(path)
  const restarted = new TestSettingsService(path)
  await restarted.load()
  await rmdir(path)
  await rename(`${path}.saved`, path)
  let activeOverlayKey = `F3`
  let activeConsoleKey: string | null = null
  restarted.setKeybindHandler(settings => { activeOverlayKey = settings.overlayKey })
  restarted.setChangeHandler(settings => { activeConsoleKey = settings.consoleKey })

  await restarted.saveMaintenanceSnapshot(`https://example.test/api`, { enabled: false, title: ``, text: ``, revision: 1 })
  assert.equal(activeOverlayKey, `F8`)
  assert.equal(activeConsoleKey, `Minus`)
  await restarted.updateSettings({ audioSfxEnabled: false })

  const reloaded = await new TestSettingsService(path).load()
  assert.equal(reloaded.consoleKey, `Minus`)
  assert.equal(reloaded.overlayKey, `F8`)
  assert.equal(reloaded.audioSfxEnabled, false)
})

test(`unreadable settings are left untouched until a later save can read them`, async context => {
  context.mock.method(console, `warn`, () => undefined)
  const path = await persistenceFixture()
  await writeFile(path, `{interrupted settings`)
  const settings = new TestSettingsService(path)
  await settings.load()

  await assert.rejects(settings.updateSettings({ consoleKey: `Minus` }))
  await assert.rejects(settings.saveMaintenanceSnapshot(`https://example.test/api`, { enabled: false, title: ``, text: ``, revision: 1 }))

  assert.equal(await readFile(path, `utf8`), `{interrupted settings`)
  await writeFile(path, JSON.stringify({ consoleKey: `Backquote`, overlayKey: `F8` }))
  await settings.updateSettings({ audioSfxVolume: 0.25 })
  assert.equal((await new TestSettingsService(path).load()).consoleKey, `Backquote`)
})

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
