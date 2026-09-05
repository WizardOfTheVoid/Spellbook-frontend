import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Display } from 'electron'
import { AppSettingsService } from './app-settings-service'

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
